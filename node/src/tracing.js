import 'dotenv/config';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
  : 'http://tempo.tomo-infra.svc.cluster.local:4318/v1/traces';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'yhub',
  traceExporter: new OTLPTraceExporter({ url: endpoint }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => sdk.shutdown());

process.on('uncaughtException', (err) => {
  if (err && (
    err.name === 'SocketClosedUnexpectedlyError' || 
    err.message === 'Socket closed unexpectedly' ||
    (err.message && err.message.includes('Redis')) ||
    (err.message && err.message.includes('socket'))
  )) {
    console.warn('[Tracing] Caught unhandled Redis error to prevent crash:', err.message || err);
    return;
  }
  console.error('[Tracing] Uncaught Exception:', err);
  process.exit(1);
});

