import { Scenario, ScenarioControllerInterface } from 'dssim-core';
import { splitEdcFactory } from '../configurations/splitEdcFactory.js';
import { SplitEDCInstance } from 'dssim-kubernetes-controller';
import { EDCController } from 'dssim-edc-controller';
import { DataAddress } from 'edc-lib/management-api/asset-api';
import { Stopwatch } from 'ts-stopwatch';
import { ContractRequest } from 'edc-lib/management-api/contract-negotiation-api';
import { catalogHelper } from '../helper/CatalogHelper.js';


const parallelConsumers = Number(process.env.LATENCY_TEST_PARALLEL_CONSUMERS) || 5;
const assetCount = Number(process.env.LATENCY_TEST_ASSET_COUNT) || 5;
const LATENCY_VALUES_MS = (process.env.LATENCY_VALUES_MS?.split(',').map(Number)) || [5, 50, 100, 200, 500];

export class LatencyResilienceTest implements Scenario {
    scenario_name = 'EDC Latency Resilience Test - Network Impairment Tolerance';

    async run(controller: ScenarioControllerInterface): Promise<void> {
        controller.log(
            'info',
            ' EDC LATENCY RESILIENCE TEST - NETWORK IMPAIRMENT TOLERANCE ',
            'LatencyResilienceTest',
            {}
        );

        // ============================================
        // PHASE 0: Ensure correct configurations   
        // ============================================
        if (LATENCY_VALUES_MS.length !== parallelConsumers || LATENCY_VALUES_MS.length !== assetCount) {
            controller.log(
                'warn',
                `Configuration mismatch: LATENCY_VALUES_MS length (${LATENCY_VALUES_MS.length}) does not match parallelConsumers (${parallelConsumers}) or assetCount (${assetCount}).\n`,
                'LatencyResilienceTest',
                {}
            );
            throw new Error('Configuration mismatch: Ensure LATENCY_VALUES_MS length matches parallelConsumers and assetCount.');
        }

        controller.log(
            'info',
            `Configuration:\n` +
            `  • Parallel Consumers: ${parallelConsumers}\n` +
            `  • Assets per Provider: ${assetCount}\n` +
            `  • Latency Test Values: ${LATENCY_VALUES_MS.join(', ')} ms\n`,
            'LatencyResilienceTest',
            {}
        );

        // ============================================
        // PHASE 1: Deploy Provider Connector
        // ============================================
        controller.log(
            'info',
            '\n━━━ PHASE 1: Deploy EDC Provider/ Consumer Connectors ━━━\n',
            'LatencyResilienceTest',
            {}
        );

        const provider = await controller.startConnector('x-api-key', 'integration-test-key', 'edcprovider-cp', splitEdcFactory(`edcprovider`));
        controller.log('info', '  ✓ Provider connector deployed and ready\n', 'LatencyResilienceTest', {});

        const consumers = await Promise.all(
            Array.from({ length: parallelConsumers }, (_, i) =>
                controller.startConnector(
                    'x-api-key',
                    'integration-test-key',
                    `edcconsumer-b5-${i}-cp`,
                    splitEdcFactory(`edcconsumer-b5-${i}`)
                )
            )
        );

        controller.log(
            'info',
            `  ✓ All ${parallelConsumers} consumer connectors deployed and ready\n`,
            'LatencyResilienceTest',
            {}
        );

        // ============================================
        // PHASE 2: Create Assets on Provider
        // ============================================
        controller.log(
            'info',
            `\n━━━ PHASE 2: Create ${assetCount} Test Assets on Provider ━━━\n`,
            'LatencyResilienceTest',
            {}
        );

        const assets = await this.setupProviderAssets(controller, provider);
        await new Promise(resolve => setTimeout(resolve, 3000));


        // ============================================
        // PHASE 3: Test Resilience at Each Latency Level
        // ============================================
        controller.log(
            'info',
            '\n━━━ PHASE 3: Execute Latency Resilience Tests ━━━\n',
            'LatencyResilienceTest',
            {}
        );

        // Assign network profile to each consumer based on the LATENCY_VALUES_MS array
        for (let i = 0; i < LATENCY_VALUES_MS.length; i++) {
            await this.assignNetworkLatency(
                controller,
                consumers[i],
                LATENCY_VALUES_MS[i]
            );
        }

        const randomAssetIndex = assets[Math.floor(Math.random() * assetCount)];
        await this.baselineTest(controller, consumers, randomAssetIndex, LATENCY_VALUES_MS);
        await new Promise(resolve => setTimeout(resolve, 5000));

        await this.fixedAssetParallelConsumerTest(controller, consumers, randomAssetIndex, LATENCY_VALUES_MS);
        await new Promise(resolve => setTimeout(resolve, 5000));
        await this.oneAssetPerConsumerTest(controller, consumers, assets, LATENCY_VALUES_MS);

        await this.removeNetworkLatency(controller, consumers);

    }
    // Baseline Test: Consumer based latency profile, non-parallel
    private async baselineTest(
        controller: ScenarioControllerInterface,
        consumers: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>[],
        assetId: string,
        latencyValuesMs: number[]
    ): Promise<void> {
        controller.log(
            'info',
            `\n━━━ Baseline Test (No Latency) for Asset: ${assetId} ━━━\n`,
            'LatencyResilienceTest',
            {}
        );

        for (let i = 0; i < consumers.length; i++) {
            await this.negotiateandTransferAsset(controller, consumers[i], assetId, i, latencyValuesMs[i], true);
        }
    }
    // Version 1: Fixed Asset, Parallel Access
    private async fixedAssetParallelConsumerTest(
        controller: ScenarioControllerInterface,
        consumers: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>[],
        assetId: string,
        latencyValuesMs: number[]
    ): Promise<void> {
        controller.log(
            'info',
            `\n━━━ Fixed Asset Parallel Consumer Test for Asset: ${assetId} ━━━\n`,
            'LatencyResilienceTest',
            {}
        );

        const result = await Promise.allSettled(
            consumers.map(async (consumer, idx) => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
                return this.negotiateandTransferAsset(controller, consumer, assetId, idx, latencyValuesMs[idx]);
            })
        );

        controller.log(
            'info',
            `  ✓ Fixed Asset Parallel Consumer Test completed for Asset: ${assetId}\n`,
            'LatencyResilienceTest',
            { asset: assetId, results: JSON.stringify(result) }
        );


    }
    // Version 2: One Asset per Consumer, Parallel Access
    private async oneAssetPerConsumerTest(
        controller: ScenarioControllerInterface,
        consumers: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>[],
        assets: string[],
        latencyValuesMs: number[]
    ): Promise<void> {
        controller.log(
            'info',
            `\n━━━ One Asset Per Consumer Test ━━━\n`,
            'LatencyResilienceTest',
            {}
        );

        const result = await Promise.all(
            consumers.map(async (consumer, idx) => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
                await this.negotiateandTransferAsset(controller, consumer, assets[idx], idx, latencyValuesMs[idx]);
            })
        );

        controller.log(
            'info',
            `  ✓ One Asset Per Consumer Test completed\n`,
            'LatencyResilienceTest',
            { results: JSON.stringify(result) }
        );
    }


    private async setupProviderAssets(
        controller: ScenarioControllerInterface,
        provider: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>
    ): Promise<string[]> {
        const assets: string[] = [];

        try {
            // Create assets and contract definition
            for (let i = 0; i < assetCount; i++) {
                const assetId = `latency-test-asset-${i}`;
                assets.push(assetId);

                const asset = await (provider.componentController as EDCController).connectorApi.controlPlane.assetService.createAssetV3({
                    body: {
                        '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
                        '@id': assetId,
                        properties: {
                            id: assetId,
                            name: assetId,
                            contenttype: 'application/json',
                        },
                        dataAddress: {
                            type: 'HttpData',
                            baseUrl: 'https://jsonplaceholder.typicode.com/users',
                            name: assetId,
                        } as DataAddress & { baseUrl: string; name: string },
                    },
                });


                // Create Policy
                await (provider.componentController as EDCController).connectorApi.controlPlane.policyService.createPolicyDefinitionV3({
                    body: {
                        '@context': {
                            '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                        },
                        '@id': `policyId_${i}`,
                        '@type': 'PolicyDefinition',
                        policy: {
                            '@context': 'http://www.w3.org/ns/odrl.jsonld',
                            '@type': 'Set',
                            'permission': [
                                {
                                    target: assetId,
                                    action: 'use',
                                    constraint: []
                                }]

                        },
                    },
                });

                // Create contract definition for this asset
                await (provider.componentController as EDCController).connectorApi.controlPlane.contractDefinitionService.createContractDefinitionV3({
                    body: {
                        '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
                        '@type': 'ContractDefinition',
                        '@id': `latency-contract-def-${i}`,
                        accessPolicyId: `policyId_${i}`,
                        contractPolicyId: `policyId_${i}`,
                        assetsSelector: [
                            {
                                operandLeft: 'https://w3id.org/edc/v0.0.1/ns/id' as any,
                                operator: '=',
                                operandRight: assetId as any,
                            },
                        ],
                    },
                });
            }

            controller.log(
                'info',
                `  ✓ Created ${assetCount} test assets with unrestricted policy\n`,
                'LatencyResilienceTest',
                {}
            );
        } catch (error) {
            controller.log(
                'warn',
                `  ⚠ Asset setup error: ${error}\n`,
                'LatencyResilienceTest',
                {}
            );
            throw error;
        }
        return assets;
    }



    private async negotiateandTransferAsset(
        controller: ScenarioControllerInterface,
        consumer: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>,
        assetId: string,
        consumerIdx: number,
        latencyMs: number,
        baseLine: boolean = false
    ): Promise<void> {

        try {
            const catalog = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.catalogService.requestCatalogV3({
                body: {
                    '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
                    counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
                    protocol: 'dataspace-protocol-http',
                    querySpec: {
                        offset: 0,
                        limit: assetCount,
                    }
                }
            });

            const offerPolicyContext = await catalogHelper.getOfferPolicyDetails(assetId, catalog);
            const negotiationStopwatch = new Stopwatch();
            negotiationStopwatch.start();

            const contractNegotiationResponse = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.contractNegotiationService.initiateContractNegotiationV3({
                body: {
                    '@context': {
                        '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                    },
                    counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
                    policy: offerPolicyContext.Policy,
                    protocol: 'dataspace-protocol-http',
                },

            });

            const Id = contractNegotiationResponse.data?.['@id']?.toString() as string;
            const waitForState = async (
                id: string,
                targetState: string,
                maxRetries = 60
            ) => {
                for (let i = 0; i < maxRetries; i++) {
                    const status = await (consumer.componentController as EDCController).connectorApi.controlPlane.contractNegotiationService.getNegotiationStateV3({ path: { id } });

                    if (status.data?.state === targetState || status.data?.state === 'TERMINATED') {
                        return status.data.state;
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
                throw new Error(`Negotiation timed out at ${negotiationStopwatch.stop()}ms under ${latencyMs}ms latency`);
            };

            const finalState = await waitForState(Id, 'FINALIZED');
            if (finalState === 'TERMINATED') {
                throw new Error(`${baseLine ? 'Baseline ' : ''}Contract negotiation was terminated at ${negotiationStopwatch.stop()}ms under ${latencyMs}ms latency`);
            }

            const contractResponse = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.contractNegotiationService.getAgreementForNegotiationV3({ path: { id: Id! } });

            const contractId = contractResponse.data?.['@id']?.toString() as string;
            const elapsedTime = negotiationStopwatch.stop();

            controller.log(
                'info',
                `  ✓ ${baseLine ? 'Baseline ' : ''}Consumer ${consumerIdx} successfully negotiated contract for asset ${assetId} with contract ID: ${contractId} in ${elapsedTime}ms under ${latencyMs}ms latency\n`,
                'LatencyResilienceTest',
                { consumer: consumer.instanceController.deploymentName?.toString() || consumerIdx.toString(), asset: assetId, contractId: contractId, negotiationTimeMs: elapsedTime.toString(), latency: latencyMs.toString() }
            )
        } catch (error) {
            controller.log(
                'error',
                `  ✗ ${baseLine ? 'Baseline ' : ''}Consumer ${consumerIdx} failed to negotiate contract for asset ${assetId}\n`,
                'LatencyResilienceTest',
                { consumer: consumer.instanceController.deploymentName?.toString() || consumerIdx.toString(), asset: assetId, latency: latencyMs.toString() }
            );
        }
    }

    private async assignNetworkLatency(
        controller: ScenarioControllerInterface,
        consumers: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>,
        latencyMs: number
    ): Promise<void> {
        controller.log(
            'info',
            `\n━━━ Assigning ${latencyMs}ms Network Latency to Consumer: ${consumers.instanceController.deploymentName} ━━━\n`,
            'LatencyResilienceTest',
            {}
        );

        await (consumers.instanceController as SplitEDCInstance).setNetworkControl({
            ingress: {
                delay: { value: latencyMs, unit: 'ms' }
            }
        });

    }

    private async removeNetworkLatency(
        controller: ScenarioControllerInterface,
        consumers: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>[]
    ): Promise<void> {
        controller.log(
            'info',
            `\n━━━ Removing Network Latency from All Consumers ━━━\n`,
            'LatencyResilienceTest',
            {}
        );

        for (const consumer of consumers) {
            await (consumer.instanceController as SplitEDCInstance).clearAllNetworkLimitations();
        }
    }

}

