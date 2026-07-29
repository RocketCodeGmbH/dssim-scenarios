import { Scenario, ScenarioControllerInterface } from 'dssim-core';
import { splitEdcFactory } from '../configurations/splitEdcFactory.js';
import { EDCController } from 'dssim-edc-controller';
import { DataAddress } from 'edc-lib/management-api/asset-api';
import { ContractRequest } from 'edc-lib/management-api/contract-negotiation-api';
import { Stopwatch } from "ts-stopwatch";


const assetBatchSize = Number(process.env.EDC_ASSET_HANDLING_BATCH_SIZE) || 100;
const assetEndIndex = Number(process.env.EDC_ASSET_HANDLING_END_INDEX) || 1000;

export class EDCAssetHandlingTest implements Scenario {
    scenario_name = 'EDC Data Asset Handling Capacity Test';
    async run(controller: ScenarioControllerInterface): Promise<void> {
        controller.log(
            'info',
            '\n=== EDC Data Asset Handling Capacity Test ===\n',
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

        const consumer = await controller.startConnector(
            'x-api-key',
            'integration-test-key',
            'edcconsumer-cp',
            splitEdcFactory('edcconsumer')
        );
        controller.log('info', '  ✓ Consumer ready\n', 'Scenario', {});

        // Create assets in batches and measure catalog query time after each batch
        for (let i = 0; i < assetEndIndex; i += assetBatchSize) {

            const batchEndIndex = Math.min(i + assetBatchSize, assetEndIndex);
            await EDCAssetHandlingTest.batchAssetCreation(controller, provider, i, batchEndIndex);

            const currentCatalogSize = batchEndIndex;
            controller.log(
                'info',
                `  ✓ Created total ${currentCatalogSize} assets\n`,
                'Scenario',
                {}
            );

            await EDCAssetHandlingTest.measureCatalogQuery(controller, consumer);

            const assetId = `Asset_${currentCatalogSize - 1}`;
            const randomAssetIndex = Math.floor(Math.random() * currentCatalogSize);
            const randomAssetId = `Asset_${randomAssetIndex}`;

            await EDCAssetHandlingTest.measureContractNegotiation(controller, consumer, assetId);
            await EDCAssetHandlingTest.measureContractNegotiation(controller, consumer, randomAssetId);

        }
    }


    static async batchAssetCreation(controller: ScenarioControllerInterface, provider: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>, startIndex: number, endIndex: number): Promise<void> {
        for (let i = startIndex; i < endIndex; i++) {
            const assetID = `Asset_${i}`;
            // Create Asset in the provider connector
            try {
                const assetResponse = await (
                    provider.componentController as EDCController
                ).connectorApi.controlPlane.assetService.createAssetV3({
                    body: {
                        '@context': {
                            '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                        },
                        '@id': assetID,
                        properties: {
                            id: assetID,
                            name: assetID,
                            contenttype: 'application/json',
                        },
                        dataAddress: {
                            type: 'HttpData',
                            baseUrl: 'https://jsonplaceholder.typicode.com/users',
                            name: assetID,
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

            // Create Policy and Contract Definition for the assets
            if (startIndex === 0) {
                try {
                    const policyResponse = await (
                        provider.componentController as EDCController
                    ).connectorApi.controlPlane.policyService.createPolicyDefinitionV3({
                        body: {
                            '@context': {
                                '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                            },
                            '@id': `Policy`,
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

                    const contractDefinitionResponse = await (
                        provider.componentController as EDCController
                    ).connectorApi.controlPlane.contractDefinitionService.createContractDefinitionV3({
                        body: {
                            '@context': {
                                '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                            },
                            '@type': 'ContractDefinition',
                            '@id': `ContractDefinition`,
                            accessPolicyId: `Policy`,
                            contractPolicyId: `Policy`,
                            assetsSelector: []
                        },
                    });
                    controller.log(
                        'info',
                        `  DEBUG Contract Definition response:` + JSON.stringify(contractDefinitionResponse, null, 2),
                        'Scenario',
                        {}
                    );

                } catch (error) {
                    controller.log(
                        'warn',
                        `  ⚠ Warning: Could not create policy or contract definition: ${error}\n`,
                        'Scenario',
                        {}
                    );
                    return;
                }

            }
        }
    }

    static async measureCatalogQuery(controller: ScenarioControllerInterface, consumer: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>): Promise<void> {
        const stopwatch = new Stopwatch();
        stopwatch.start();

        // Measure catalog query time
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
                    querySpec: {
                        limit: assetEndIndex,
                        sortOrder: 'ASC',
                    },
                }
            });
            stopwatch.stop();
            controller.log(
                'info',
                `  ✓ Catalog query time for assets: ${stopwatch.getTime()} ms\n`,
                'Scenario',
                {}
            );
        } catch (error) {
            stopwatch.stop();
            controller.log(
                'warn',
                `  ⚠ Warning: Could not query catalog for assets: ${error}\n`,
                'Scenario',
                {}
            );
        }

        // Measure catalog query time for last n assets
        stopwatch.reset();
        try {
            stopwatch.start();
            const catalogResponseLastN = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.catalogService.requestCatalogV3({
                body: {
                    '@context': {
                        '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                    },
                    '@type': 'CatalogRequest',
                    counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
                    protocol: 'dataspace-protocol-http',
                    querySpec: {
                        limit: assetBatchSize,
                        sortOrder: 'DESC',
                    },
                }
            });

            stopwatch.stop();
            controller.log(
                'info',
                `  ✓ Catalog query time for last ${assetBatchSize} assets: ${stopwatch.getTime()} ms\n`,
                'Scenario',
                {}
            );
        } catch (error) {
            stopwatch.stop();
            controller.log(
                'warn',
                `  ⚠ Warning: Could not query catalog for last ${assetBatchSize} assets: ${error}\n`,
                'Scenario',
                {}
            );
        }


    }


    static async getOfferPolicyDetails(controller: ScenarioControllerInterface, consumer: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>, assetId: string): Promise<{ catalogId: string; offerPolicy: Record<string, any> }> {
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
                    querySpec: {
                        limit: assetEndIndex,
                        sortOrder: 'ASC',
                    },
                }
            });

            const catalog = catalogResponse.data;

            const dataset = catalog?.['dcat:dataset'] as Array<Record<string, any>>;

            const matchedDataset = dataset.find((d: any) => d['@id'] === assetId);
            if (!matchedDataset) {
                throw new Error(`Asset ID ${assetId} not found in catalog`);
            }

            const offerPolicy = matchedDataset?.['odrl:hasPolicy'];
            const offerPolicyArray = Array.isArray(offerPolicy) ? offerPolicy : [offerPolicy];
            if (offerPolicyArray.length === 0) {
                throw new Error(`No offer policy for asset ${assetId} found in catalog`);
            }

            const catalogId = offerPolicyArray[0]['@id'];
            if (!catalogId) {
                throw new Error(`Catalog ID for asset ${assetId} not found in catalog`);
            }

            controller.log(
                'info',
                `  DEBUG Asset ID response + CatalogId + offerPolicy:` + JSON.stringify({ assetId: matchedDataset['@id'], catalogId, offerPolicy }, null, 2),
                'Scenario',
                {}
            );

            return { catalogId: catalogId, offerPolicy: offerPolicyArray[0] };
        } catch (error) {
            controller.log(
                'warn',
                `  ⚠ Warning: Could not retrieve offer policy details for asset ${assetId}: ${error}\n`,
                'Scenario',
                {}
            );
            return { catalogId: '', offerPolicy: {} };
        }
    }

    static async measureContractNegotiation(controller: ScenarioControllerInterface, consumer: Awaited<ReturnType<ScenarioControllerInterface['startConnector']>>, assetId: string): Promise<void> {
        const stopwatch = new Stopwatch();
        const offerPolicyContext = await EDCAssetHandlingTest.getOfferPolicyDetails(controller, consumer, assetId);

        try {
            stopwatch.start();

            const negotiation = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.contractNegotiationService.initiateContractNegotiationV3({
                body: {
                    '@context': {
                        '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
                    },
                    counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
                    policy: {
                        '@context': 'http://www.w3.org/ns/odrl.jsonld',
                        '@id': offerPolicyContext.catalogId,
                        '@type': `http://www.w3.org/ns/odrl/2/Offer`,
                        assigner: 'did:web:edcprovider-cp%3A9083:tester',
                        target: assetId,
                        ...offerPolicyContext.offerPolicy,
                    },
                    protocol: 'dataspace-protocol-http',
                } as ContractRequest,
            }
            );

            const negotiationId = negotiation.data?.['@id']?.toString() as string;

            controller.log(
                'info',
                `  ✓ Contract negotiation initiated for asset ${assetId} with negotiation ID: ${negotiationId}\n`,
                'Scenario',
                {}
            );

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

            const finalState = await waitForState(negotiationId, 'FINALIZED');

            if (finalState === 'TERMINATED') {
                stopwatch.stop();
                controller.log(
                    'info',
                    `Contract negotiation was terminated after ${stopwatch.getTime()} ms`,
                    'Scenario',
                    {}
                );
                return;
            }

            const contractResponse = await (
                consumer.componentController as EDCController
            ).connectorApi.controlPlane.contractNegotiationService.getAgreementForNegotiationV3(
                { path: { id: negotiationId } }
            );
            const contractId = contractResponse.data?.['@id']?.toString() as string;


            controller.log(
                'info',
                `[$ ✓ Contract negotiation reached FINALIZED: ${contractId} after ${stopwatch.getTime()} ms\n`,
                'scenario',
                { contractId, status: 'success' }
            );

        } catch (error) {
            controller.log(
                'warn',
                ` ⚠ Contract negotiation failed: ${error}\n`,
                'scenario',
                { status: 'error' }
            );
            throw error;
        }
    }
}


