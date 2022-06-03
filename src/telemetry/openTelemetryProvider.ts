import type { AttributeValue, Span, Tracer } from '@opentelemetry/api';
import { context as contextOT, diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
// import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
	BasicTracerProvider,
	BatchSpanProcessor,
	ConsoleSpanExporter,
	SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import type { HttpsProxyAgent } from 'https-proxy-agent';
import type { TelemetryContext, TelemetryProvider } from './telemetry';

const honeycombApiKey = '<key>';

export class OpenTelemetryProvider implements TelemetryProvider {
	private readonly tracer: Tracer;

	constructor(context: TelemetryContext, agent?: HttpsProxyAgent, debugging?: boolean) {
		if (debugging) {
			diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);
		}

		const provider = new BasicTracerProvider({
			resource: new Resource({
				[SemanticResourceAttributes.SERVICE_NAME]: 'GitLens',
			}) as any,
		});

		if (debugging) {
			provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
		}
		// } else {

		const exporter = new OTLPTraceExporter({
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': honeycombApiKey },
			compression: 'gzip' as any,
			httpAgentOptions: agent?.options,
		});
		provider.addSpanProcessor(debugging ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter));
		// }

		provider.register();

		this.tracer = trace.getTracer(context.extensionId);

		const ctx = contextOT.active();
		for (const [name, value] of Object.entries(context)) {
			ctx.setValue(Symbol(name), value);
		}
	}

	dispose(): void {
		trace.disable();
	}

	sendEvent(name: string, data?: Record<string, AttributeValue>): void {
		const span = this.tracer.startSpan(name, { startTime: Date.now() });
		if (data != null) {
			span.setAttributes(data);
		}
		span.end();
	}

	startEvent(name: string, data?: Record<string, AttributeValue>): Span | undefined {
		const span = this.tracer.startSpan(name, { startTime: Date.now() });
		if (data != null) {
			span.setAttributes(data);
		}
		return span;
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
		if (value == null) {
			this.deleteGlobalContext(name);
		} else {
			contextOT.active().setValue(Symbol(name), value);
		}
	}

	deleteGlobalContext(name: string): void {
		contextOT.active().deleteValue(Symbol(name));
	}
}
