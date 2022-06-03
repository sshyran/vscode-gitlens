import type { AttributeValue, Span } from '@opentelemetry/api';
import type { Disposable} from 'vscode';
import { version as codeVersion, env } from 'vscode';
import { getProxyAgent } from '@env/fetch';
import { getPlatform } from '@env/platform';
import { configuration } from '../configuration';
import type { Container } from '../container';

export interface TelemetryContext {
	extensionId: string;
	extensionVersion: string;
	machineId: string;
	sessionId: string;
	language: string;
	platform: string;
	vscodeEdition: string;
	vscodeHost: string;
	vscodeVersion: string;
}

export interface TelemetryProvider extends Disposable {
	sendEvent(name: string, data?: Record<string, AttributeValue>): void;
	startEvent(name: string, data?: Record<string, AttributeValue>): Span | undefined;
	setGlobalContext(name: string, value: AttributeValue | null | undefined): void;
	deleteGlobalContext(name: string): void;
}

export class TelemetryService implements Disposable {
	private provider: TelemetryProvider | undefined;
	private enabled: boolean = false;

	constructor(private readonly container: Container) {
		container.context.subscriptions.push(
			configuration.onDidChange(e => {
				if (!e.affectsConfiguration('telemetry.enabled')) return;

				void this.ensureTelemetry(container);
			}),
			env.onDidChangeTelemetryEnabled(() => this.ensureTelemetry(container)),
		);
		void this.ensureTelemetry(container);
	}

	dispose(): void {
		this.provider?.dispose();
		this.provider = undefined;
	}

	private async ensureTelemetry(container: Container): Promise<void> {
		this.enabled = env.isTelemetryEnabled && configuration.get('telemetry.enabled', undefined, true);
		if (!this.enabled) {
			this.provider?.dispose();
			this.provider = undefined;

			return;
		}

		this.provider = new (
			await import(/* webpackChunkName: "telemetry" */ './openTelemetryProvider')
		).OpenTelemetryProvider(
			{
				extensionId: container.id,
				extensionVersion: container.version,
				machineId: env.machineId,
				sessionId: env.sessionId,
				language: env.language,
				platform: getPlatform(),
				vscodeEdition: env.appName,
				vscodeHost: env.appHost,
				vscodeVersion: codeVersion,
			},
			getProxyAgent(),
			container.debugging,
		);
	}

	sendEvent(name: string, data?: Record<string, AttributeValue>): void {
		if (!this.enabled || this.provider == null) return;

		this.provider.sendEvent(name, data);
	}

	startEvent(name: string, data?: Record<string, AttributeValue>): Span | undefined {
		if (!this.enabled || this.provider == null) return;

		return this.provider.startEvent(name, data);
	}

	// sendErrorEvent(
	// 	name: string,
	// 	data?: Record<string, string>,
	// ): void {
	// }

	// sendException(
	// 	error: Error | unknown,
	// 	data?: Record<string, string>,
	// ): void {
	// }

	setGlobalContext(name: string, value: AttributeValue | null | undefined): void {
		// TODO@eamodio save context if provider is missing
		this.provider?.setGlobalContext(name, value);
	}

	deleteGlobalContext(name: string): void {
		// TODO@eamodio delete context if provider is missing
		this.provider?.deleteGlobalContext(name);
	}
}
