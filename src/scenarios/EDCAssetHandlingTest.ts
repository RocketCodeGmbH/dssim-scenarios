import {Scenario, ScenarioControllerInterface} from 'dssim-core';
import {splitEdcFactory} from '../configurations/splitEdcFactory.js';
import {EDCController} from 'dssim-edc-controller';
import {DataAddress} from 'edc-lib/management-api/asset-api';
import {ContractRequest} from 'edc-lib/management-api/contract-negotiation-api';
import {EDCAssetCatalogHelper} from '../helper/EDCAssetCatalogHelper.js';
import {Stopwatch} from 'ts-stopwatch';

const assetBatchSize = Number(process.env.EDC_ASSET_HANDLING_BATCH_SIZE) || 100;
const assetEndIndex = Number(process.env.EDC_ASSET_HANDLING_END_INDEX) || 1000;
const assetCreationDelay = Number(process.env.EDC_ASSET_CREATION_DELAY) || 1000;

export class EDCAssetHandlingTest implements Scenario {
  scenario_name = 'EDC Data Asset Handling Capacity Test';

  async run(controller: ScenarioControllerInterface): Promise<void> {
    controller.log(
      'info',
      '\n=== EDC Data Asset Handling Capacity Test ===\n',
      'Scenario',
      {}
    );

    const [provider, consumer] = await Promise.all([
      controller.startConnector(
        'x-api-key',
        'integration-test-key',
        'edcprovider-cp',
        splitEdcFactory('edcprovider')
      ),
      controller.startConnector(
        'x-api-key',
        'integration-test-key',
        'edcconsumer-cp',
        splitEdcFactory('edcconsumer')
      ),
    ]);
    controller.log(
      'info',
      '  ✓ Started provider and consumer connectors\n',
      'Scenario',
      {}
    );

    for (let i = 0; i < assetEndIndex; i += assetBatchSize) {
      const batchEndIndex = Math.min(i + assetBatchSize, assetEndIndex);
      await EDCAssetHandlingTest.batchAssetCreation(
        controller,
        provider,
        i,
        batchEndIndex
      );

      const currentCatalogSize = batchEndIndex;
      controller.log(
        'info',
        `  [Batch ${
          i / assetBatchSize + 1
        }] Created total ${currentCatalogSize} assets\n`,
        'Scenario',
        {}
      );

      // give the provider's catalog a moment to index the newest batch
      await new Promise(resolve => setTimeout(resolve, assetCreationDelay));

      const catalogResponse = await EDCAssetHandlingTest.measureCatalogQuery(
        controller,
        consumer,
        currentCatalogSize
      );

      const assetId = `Asset_${currentCatalogSize - 1}`;
      const randomAssetIndex = Math.floor(Math.random() * currentCatalogSize);
      const randomAssetId = `Asset_${randomAssetIndex}`;

      await EDCAssetHandlingTest.measureContractNegotiation(
        controller,
        consumer,
        assetId,
        catalogResponse
      );
      await EDCAssetHandlingTest.measureContractNegotiation(
        controller,
        consumer,
        randomAssetId,
        catalogResponse
      );
    }
  }

  static async batchAssetCreation(
    controller: ScenarioControllerInterface,
    provider: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >,
    startIndex: number,
    endIndex: number
  ): Promise<void> {
    const timestamp = new Date().getFullYear();
    const firstDate = new Date(Date.UTC(timestamp, 0, 1, 0, 0)).toISOString();
    const lastDate = new Date(
      Date.UTC(timestamp, 11, 31, 23, 59)
    ).toISOString();

    for (let i = startIndex; i < endIndex; i++) {
      const assetID = `Asset_${i}`;
      try {
        await (
          provider.componentController as EDCController
        ).connectorApi.controlPlane.assetService.createAssetV3({
          body: {
            '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
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
            } as DataAddress & {baseUrl: string; name: string},
          },
        });

        await (
          provider.componentController as EDCController
        ).connectorApi.controlPlane.policyService.createPolicyDefinitionV3({
          body: {
            '@context': [
              'https://w3id.org/edc/connector/management/v0.0.1',
            ] as unknown as {[key: string]: unknown},
            '@id': `Policy_${i}`,
            '@type': 'PolicyDefinition',
            policy: {
              '@context': 'http://www.w3.org/ns/odrl.jsonld',
              '@type': 'Set',
              permission: [
                {
                  target: assetID,
                  action: 'use',
                  constraint: [
                    {
                      leftOperand: 'inForceDate',
                      operator: 'gteq',
                      rightOperand: firstDate,
                    },
                    {
                      leftOperand: 'inForceDate',
                      operator: 'lteq',
                      rightOperand: lastDate,
                    },
                  ],
                },
              ],
              prohibition: [],
              obligation: [],
            },
          },
        });

        await (
          provider.componentController as EDCController
        ).connectorApi.controlPlane.contractDefinitionService.createContractDefinitionV3(
          {
            body: {
              '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
              '@type': 'ContractDefinition',
              '@id': `ContractDefinition_${i}`,
              accessPolicyId: `Policy_${i}`,
              contractPolicyId: `Policy_${i}`,
              assetsSelector: [
                {
                  operandLeft: 'https://w3id.org/edc/v0.0.1/ns/id' as any,
                  operator: '=',
                  operandRight: assetID as any,
                },
              ],
            },
          }
        );
      } catch (error) {
        controller.log(
          'warn',
          `⚠ Warning: Failed in batch asset creation for ${assetID}: ${error}\n`,
          'Scenario',
          {}
        );
        throw error;
      }
    }

    controller.log('info', '[BATCH_ASSET_CREATION_COMPLETED]', 'Scenario', {
      startIndex: startIndex.toString(),
      endIndex: endIndex.toString(),
      assetCount: (endIndex - startIndex).toString(),
    });
  }

  static async measureCatalogQuery(
    controller: ScenarioControllerInterface,
    consumer: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >,
    currentCatalogSize: number
  ): Promise<any> {
    const stopwatch = new Stopwatch();
    const offset = Math.max(0, currentCatalogSize - assetBatchSize);
    try {
      stopwatch.start();
      const catalogResponse = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.catalogService.requestCatalogV3({
        body: {
          '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
          '@type': 'CatalogRequest',
          counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
          protocol: 'dataspace-protocol-http',
          querySpec: {limit: currentCatalogSize},
        },
      });
      stopwatch.stop();

      controller.log(
        'info',
        'Full catalog query completed with ' +
          currentCatalogSize +
          ' assets in ' +
          stopwatch.getTime() +
          ' ms',
        'Scenario',
        {
          queryType: 'FULL',
          catalogSize: currentCatalogSize.toString(),
          queryLimit: currentCatalogSize.toString(),
          durationMs: stopwatch.getTime().toString(),
        }
      );

      stopwatch.reset();
      stopwatch.start();
      await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.catalogService.requestCatalogV3({
        body: {
          '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
          '@type': 'CatalogRequest',
          counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
          protocol: 'dataspace-protocol-http',
          querySpec: {
            limit: assetBatchSize,
            offset: Math.max(0, currentCatalogSize - assetBatchSize),
          },
        },
      });
      stopwatch.stop();
      controller.log(
        'info',
        'Last batch catalog query completed with ' +
          assetBatchSize +
          ' assets in ' +
          stopwatch.getTime() +
          ' ms',
        'Scenario',
        {
          queryType: 'LAST_BATCH',
          catalogSize: currentCatalogSize.toString(),
          offset: offset.toString(),
          queryLimit: assetBatchSize.toString(),
          durationMs: stopwatch.getTime().toString(),
        }
      );

      return catalogResponse;
    } catch (error) {
      stopwatch.stop();
      controller.log(
        'warn',
        `  ⚠ Warning: Could not query catalog for assets: ${error}\n`,
        'Scenario',
        {}
      );
      throw error;
    }
  }

  static async measureContractNegotiation(
    controller: ScenarioControllerInterface,
    consumer: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >,
    assetId: string,
    catalogResponse: any
  ): Promise<void> {
    const stopwatch = new Stopwatch();
    const offerPolicy = await EDCAssetCatalogHelper.getOfferPolicyDetails(
      assetId,
      catalogResponse
    );

    try {
      stopwatch.start();
      const negotiation = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.contractNegotiationService.initiateContractNegotiationV3(
        {
          body: {
            '@context': [
              'https://w3id.org/edc/connector/management/v0.0.1',
            ] as unknown as {[key: string]: unknown},
            counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
            policy: offerPolicy.Policy,
            protocol: 'dataspace-protocol-http',
          } as ContractRequest,
        }
      );

      const negotiationId = negotiation.data?.['@id']?.toString() as string;
      if (!negotiationId) {
        throw new Error(
          `Contract negotiation for asset ${assetId} failed: missing negotiation ID`
        );
      }

      controller.log(
        'info',
        `  ✓ Contract negotiation initiated for asset ${assetId} (negotiation ${negotiationId})\n`,
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
            {path: {id}}
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
          '  ⚠ Contract negotiation for asset ${assetId} terminated before finalization\n',
          'Scenario',
          {
            assetId,
            state: 'TERMINATED',
            durationMs: stopwatch.getTime().toString(),
          }
        );
        return;
      }
      stopwatch.stop();

      const contractResponse = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.contractNegotiationService.getAgreementForNegotiationV3(
        {
          path: {id: negotiationId},
        }
      );
      const contractId = contractResponse.data?.['@id']?.toString() as string;

      controller.log(
        'info',
        '  ✓ Contract negotiation finalized for asset ${assetId} (negotiation ${negotiationId}, contract ${contractId}) in ${stopwatch.getTime()} ms\n',
        'Scenario',
        {
          assetId,
          contractId,
          state: 'FINALIZED',
          durationMs: stopwatch.getTime().toString(),
        }
      );
    } catch (error) {
      controller.log(
        'warn',
        `  ⚠ Contract negotiation for asset ${assetId} failed: ${error}\n`,
        'Scenario',
        {}
      );
      throw error;
    }
  }
}
