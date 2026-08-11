import { Scenario, ScenarioControllerInterface } from 'dssim-core';
import { splitEdcFactory } from '../configurations/splitEdcFactory.js';
import { SplitEDCInstance } from 'dssim-kubernetes-controller';
import { Stopwatch } from "ts-stopwatch";

const latencyMs = Number(process.env.SIMPLE_NETWORK_LATENCY_MS) || 1000;

export class SimpleNetworkLatencyTest implements Scenario {
    scenario_name = 'Simple Network Latency Test';
    async run(controller: ScenarioControllerInterface): Promise<void> {
        controller.log(
            'info',
            '\n=== Simple Network Latency Test ===\n',
            'SimpleNetworkLatencyTest',
            {}
        );

        const provider = await controller.startConnector(
            'x-api-key',
            'integration-test-key',
            'edcprovider',
            splitEdcFactory('edcprovider')
        );

        const url = provider.instanceController.healthCheckUrl;
        if (!url) {
            throw new Error('No healthCheckUrl available for provider');
        }

        // Baseline
        const stopwatch = new Stopwatch();
        stopwatch.start();
        await fetch(url);
        const baselineMs = stopwatch.stop();
        stopwatch.reset();

        controller.log(
            'info',
            `Baseline: ${baselineMs}ms`,
            'SimpleNetworkLatencyTest',
            {}
        );

        // Apply latency
        await (provider.instanceController as SplitEDCInstance).setNetworkControl({
            ingress: {
                delay: { value: latencyMs, unit: 'ms' }
            },
            egress: {
                delay: { value: latencyMs, unit: 'ms' }
            }
        });


        // Delayed request
        stopwatch.start();
        await fetch(url);
        const delayedMs = stopwatch.stop();

        controller.log(
            'info',
            `With ${latencyMs}ms delay: ${delayedMs}ms`,
            'SimpleNetworkLatencyTest',
            {}
        );

    }
}
