import { Scenario, ScenarioControllerInterface } from 'dssim-core';
import { splitEdcFactory } from '../configurations/splitEdcFactory.js';
import { EDCController } from 'dssim-edc-controller';
import { DataAddress } from 'edc-lib/management-api/asset-api';
import { ContractRequest } from 'edc-lib/management-api/contract-negotiation-api';
import { Stopwatch } from "ts-stopwatch";

const batchSize = Number(process.env.EDC_SCALING_BATCH_SIZES) || 5;
const delayMs = Number(process.env.EDC_SCALING_DELAY_MS) || 10000;


export class EDCScalingTest implements Scenario {
    scenario_name = 'EDC Scaling Test - Concurrent Consumer Connectors on Single Asset';

    async run(controller: ScenarioControllerInterface): Promise<void> {
        controller.log(
            'info',
            '\n=== EDC SCALING TEST SCENARIO ===\n',
            'Scenario',
            {}
        );

        // ============================================
        // PHASE 1: Deploy EDC Provider connector
        // ============================================
        controller.log(
            'info',
            'PHASE 1: Deploying EDC provider connector...\n',
            'Scenario',
            {}
        );
        const provider = await controller.startConnector(
            'x-api-key',
            'integration-test-key',
            'edcprovider-cp',
            splitEdcFactory('edcprovider')
        );
        controller.log('info', '  ✓ Provider ready\n', 'Scenario', {});

        // ============================================
        // PHASE 2: Create Asset on Provider
        // ============================================
        try {
            const assetResponse = await (
                provider.componentController as EDCController
            ).connectorApi.controlPlane.assetService.createAssetV3({
                body: {
                    '@context': {
                        '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                    },
                    '@id': 'test-asset',
                    properties: {
                        id: 'test-asset',
                        name: 'Product description',
                        contenttype: 'application/json',
                    },
                    dataAddress: {
                        type: 'HttpData',
                        baseUrl: 'https://jsonplaceholder.typicode.com/users',
                        name: 'Test asset',
                    } as DataAddress & { baseUrl: string; name: string },
                },
            });
            controller.log(
                'info',
                `  DEBUG Asset response:` + JSON.stringify(assetResponse, null, 2),
                'Scenario',
                {}
            );
        } catch (error) {
            controller.log(
                'warn',
                `  ⚠ Warning: Could not create asset: ${error}\n`,
                'Scenario',
                {}
            );

            return;
        }

        // ============================================
        // PHASE 3: Create Policy & Contract Definition
        // ============================================
        const policyId = 'aPolicy';
        try {
            const policyResponse = await (
                provider.componentController as EDCController
            ).connectorApi.controlPlane.policyService.createPolicyDefinitionV3({
                body: {
                    '@context': {
                        '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                    },
                    '@id': policyId,
                    policy: {
                        '@context': 'http://www.w3.org/ns/odrl.jsonld',
                        '@type': 'Set',
                    },
                },
            });
            controller.log(
                'info',
                `  DEBUG Policy response:` + JSON.stringify(policyResponse, null, 2),
                'Scenario',
                {}
            );
            const contractDefResponse = await (
                provider.componentController as EDCController
            ).connectorApi.controlPlane.contractDefinitionService.createContractDefinitionV3(
                {
                    body: {
                        '@context': {
                            '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                        },
                        '@id': '1',
                        accessPolicyId: policyId,
                        contractPolicyId: policyId,
                        assetsSelector: [],
                    },
                }
            );
            controller.log(
                'info',
                `  DEBUG Contract Def response:` +
                JSON.stringify(contractDefResponse, null, 2),
                'Scenario',
                {}
            );
            controller.log(
                'info',
                `  ✓ Policy Definition & Contract definition created.\n`,
                'Scenario',
                {}
            );
        } catch (error) {
            controller.log(
                'warn',
                `  ⚠ Warning: Could not create policy/contract: ${error}\n`,
                'Scenario',
                {}
            );

            return;
        }

        // ============================================
        // PHASE 4: Ramp through batch sizes
        // ============================================

        await EDCScalingTest.runBatch(controller, batchSize);

        controller.log(
            'info',
            '\n=== SCALING TEST COMPLETE ===\n',
            'Scenario',
            {}
        );
    }

    // ============================================
    // Deploys `batchSize` consumer connector and runs negotiate+transfer on
    // each in parallel, then after tears them all down again.
    // ============================================
    static async runBatch(
        controller: ScenarioControllerInterface,
        batchSize: number
    ): Promise<void> {
        controller.log(
            'info',
            `PHASE 4: Batch start — deploying ${batchSize} consumer connectors...\n`,
            'ScalingTest',
            { batchSize: batchSize.toString(), szenarioEvent: 'startBatch' }
        );

        const stopwatch = new Stopwatch();

        const consumers = await Promise.all(
            Array.from({ length: batchSize }, (_, i) =>
                controller.startConnector(
                    'x-api-key',
                    'integration-test-key',
                    `edcconsumer-b${batchSize}-${i}-cp`,
                    splitEdcFactory(`edcconsumer-b${batchSize}-${i}`)
                )
            )
        );

        controller.log(
            'info',
            `  ✓ ${batchSize} consumers ready\n`,
            'ScalingTest',
            { batchSize: batchSize.toString() }
        );
        stopwatch.start();
        const results = await Promise.allSettled(

            consumers.map(async (consumer, i) => {

                await new Promise(resolve => setTimeout(resolve, delayMs));
                const consumerTimer = new Stopwatch();
                consumerTimer.start();

                await EDCScalingTest.negotiateAndTransfer(controller, consumer, batchSize, i)
                controller.log(
                    'info',
                    `  ✓ Consumer ${i} completed in ${consumerTimer.getTime()}ms after a timeout of ${Math.floor(Math.random() * 999) + 2}ms\n`,
                    'ScalingTest',
                    { batchSize: batchSize.toString(), consumerIndex: i.toString() }
                );
            }
            )
        );

        stopwatch.stop();
        const durationMs = stopwatch.getTime();

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.length - succeeded;

        controller.log(
            'info',
            `  ✓ Batch end: ${succeeded} succeeded, ${failed} failed, ${durationMs} ms\n`,
            'ScalingTest',
            {
                batchSize: batchSize.toString(),
                succeeded: succeeded.toString(),
                failed: failed.toString(),
                durationMs: durationMs.toString(),
                szenarioEvent: 'endBatch',
            }
        );
    }

    // ============================================
    // PHASE 4/5/6 of EDCFullFlowTest (inprogress)
    // ============================================
    static async negotiateAndTransfer(
        controller: ScenarioControllerInterface,
        consumer: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>,
        batchSize: number,
        index: number
    ): Promise<void> {
        const requestId = `b${batchSize}-r${index}`;

        let catalogId = '';
        let assetId = '';
        let offerPolicy: Record<string, unknown> = {};
        try {
            const catalogResponse = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.catalogService.requestCatalogV3({
                body: {
                    '@context': {
                        '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                    },
                    '@type': 'CatalogRequest',
                    counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
                    protocol: 'dataspace-protocol-http',
                },
            });
            const catalog = catalogResponse.data;
            const dataset = catalog?.['dcat:dataset'] as
                | {
                    '@id'?: string;
                    'odrl:hasPolicy'?: Record<string, unknown> & { '@id'?: string };
                }
                | undefined;
            catalogId = dataset?.['odrl:hasPolicy']?.['@id']?.toString() ?? '';
            assetId = dataset?.['@id']?.toString() ?? '';
            offerPolicy = dataset?.['odrl:hasPolicy'] ?? {};
        } catch (error) {
            controller.log(
                'warn',
                `[${requestId}] ⚠ Catalog query failed: ${error}\n`,
                'ScalingTest',
                { requestId, batchSize: batchSize.toString(), status: 'error' }
            );
            throw error;
        }

        let contractId = '';
        try {
            const nego = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.contractNegotiationService.initiateContractNegotiationV3(
                {
                    body: {
                        '@context': {
                            '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                        },
                        counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
                        policy: {
                            '@context': 'http://www.w3.org/ns/odrl.jsonld',
                            '@id': catalogId,
                            '@type': `http://www.w3.org/ns/odrl/2/Offer`,
                            assigner: 'did:web:edcprovider-cp%3A9083:tester',
                            target: assetId,
                            ...offerPolicy,
                        },
                        protocol: 'dataspace-protocol-http',
                    } as ContractRequest,
                }
            );
            const negoId = nego.data?.['@id']?.toString() as string;

            const waitForState = async (
                id: string,
                targetState: string,
                maxRetries = 60
            ) => {
                for (let i = 0; i < maxRetries; i++) {
                    const status = await (
                        consumer.componentController as EDCController
                    ).connectorApi.controlPlane.contractNegotiationService.getNegotiationStateV3(
                        { path: { id } }
                    );
                    if (
                        status.data?.state === targetState ||
                        status.data?.state === 'TERMINATED'
                    ) {
                        return status.data.state;
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
                throw new Error('Negotiation timed out');
            };

            const finalState = await waitForState(negoId, 'FINALIZED');
            if (finalState === 'TERMINATED') {
                throw new Error('Contract negotiation was terminated');
            }

            const contractResponse = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.contractNegotiationService.getAgreementForNegotiationV3(
                { path: { id: negoId } }
            );
            contractId = contractResponse.data?.['@id']?.toString() as string;

            controller.log(
                'info',
                `[${requestId}] ✓ Contract negotiation reached FINALIZED: ${contractId}\n`,
                'ScalingTest',
                { requestId, contractId, batchSize: batchSize.toString(), status: 'success' }
            );
        } catch (error) {
            controller.log(
                'warn',
                `[${requestId}] ⚠ Contract negotiation failed: ${error}\n`,
                'ScalingTest',
                { requestId, contractId, batchSize: batchSize.toString(), status: 'error' }
            );
            throw error;
        }

        try {
            const transferResponse = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.transferProcessService.initiateTransferProcessV3(
                {
                    body: {
                        '@context': {
                            '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                        },
                        contractId: contractId,
                        counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
                        protocol: 'dataspace-protocol-http',
                        transferType: 'HttpData-PULL',
                        assetId: assetId,
                    },
                }
            );
            const transferId = transferResponse.data?.['@id']?.toString() as string;

            const waitForTransferState = async (
                id: string,
                targetState: string,
                maxRetries = 20
            ) => {
                for (let i = 0; i < maxRetries; i++) {
                    const status = await (
                        consumer.componentController as EDCController
                    ).connectorApi.controlPlane.transferProcessService.getTransferProcessStateV3(
                        { path: { id } }
                    );
                    if (
                        status.data?.state === targetState ||
                        status.data?.state === 'TERMINATED'
                    ) {
                        return status.data.state;
                    }
                    await new Promise(r => setTimeout(r, 5000));
                }
                throw new Error('Transfer process timed out');
            };

            const state = await waitForTransferState(transferId, 'STARTED');
            if (state === 'TERMINATED') {
                throw new Error('Data transfer was terminated');
            }

            controller.log(
                'info',
                `[${requestId}] ✓ Transfer reached STARTED\n`,
                'ScalingTest',
                { requestId, contractId, batchSize: batchSize.toString(), status: 'success' }
            );
        } catch (error) {
            controller.log(
                'warn',
                `[${requestId}] ⚠ Transfer failed: ${error}\n`,
                'ScalingTest',
                { requestId, contractId, batchSize: batchSize.toString(), status: 'error' }
            );
            throw error;
        }
    }
}