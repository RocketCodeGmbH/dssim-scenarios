import {Scenario, ScenarioControllerInterface} from 'dssim-core';
import {splitEdcFactory} from '../configurations/splitEdcFactory.js';
import {SplitEDCInstance} from 'dssim-kubernetes-controller';
import {EDCController} from 'dssim-edc-controller';
import {DataAddress} from 'edc-lib/management-api/asset-api';
import {Stopwatch} from 'ts-stopwatch';

import {EDCAssetCatalogHelper} from '../helper/EDCAssetCatalogHelper.js';

const delayMs = Number(process.env.EDC_CONSUMERS_SETTLE_DELAY_MS) || 1000;
const LATENCY_VALUES_MS = process.env.LATENCY_VALUES_MS?.split(',').map(
  Number
) || [5, 50, 100, 200, 500];
const parallelConsumers = LATENCY_VALUES_MS.length || 5;
const assetCount = Number(process.env.LATENCY_TEST_ASSET_COUNT) || 5;

export class LatencyResilienceTest implements Scenario {
  scenario_name = 'EDC Latency Resilience Test';

  async run(controller: ScenarioControllerInterface): Promise<void> {
    controller.log(
      'info',
      ' EDC LATENCY RESILIENCE TEST',
      'LatencyResilienceTest',
      {}
    );

    // ============================================
    // PHASE 0: Ensure correct configurations
    // ============================================
    if (LATENCY_VALUES_MS.length > assetCount) {
      controller.log(
        'warn',
        `Configuration mismatch: LATENCY_VALUES_MS length (${LATENCY_VALUES_MS.length}) does not match assetCount (${assetCount}).\n`,
        'LatencyResilienceTest',
        {}
      );
      throw new Error(
        'Configuration mismatch: Ensure LATENCY_VALUES_MS length matches parallelConsumers and assetCount.'
      );
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
    // PHASE 1: Deploy Provider/Consumer Connector
    // ============================================
    controller.log(
      'info',
      '\n━━━ PHASE 1: Deploy EDC Provider/ Consumer Connectors ━━━\n',
      'LatencyResilienceTest',
      {}
    );

    const provider = await controller.startConnector(
      'x-api-key',
      'integration-test-key',
      'edcprovider-cp',
      splitEdcFactory(`edcprovider`)
    );
    controller.log(
      'info',
      '  ✓ Provider connector deployed and ready\n',
      'LatencyResilienceTest',
      {}
    );

    const consumers = await Promise.all(
      Array.from({length: parallelConsumers}, (_, i) =>
        controller.startConnector(
          'x-api-key',
          'integration-test-key',
          `edcconsumer-b5-${i}-cp`,
          splitEdcFactory(`edcconsumer-b5-${i}`)
        )
      )
    );
    await new Promise(resolve => setTimeout(resolve, delayMs));

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

    const assets = await EDCAssetCatalogHelper.setupProviderAssets(
      controller,
      provider,
      assetCount,
      'LatencyResilienceTest'
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

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
    await new Promise(resolve => setTimeout(resolve, 1000));
    const randomAsset = assets[Math.floor(Math.random() * assetCount)];

    await this.baselineTest(
      controller,
      consumers,
      randomAsset,
      LATENCY_VALUES_MS
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.fixedAssetParallelConsumerTest(
      controller,
      consumers,
      randomAsset,
      LATENCY_VALUES_MS
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.oneAssetPerConsumerTest(
      controller,
      consumers,
      assets,
      LATENCY_VALUES_MS
    );
    await this.removeNetworkLatency(controller, consumers);
  }
  // Baseline Test: Consumer based latency profile, Non-parallel
  private async baselineTest(
    controller: ScenarioControllerInterface,
    consumers: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >[],
    assetId: string,
    latencyValuesMs: number[]
  ): Promise<void> {
    controller.log(
      'info',
      `\n━━━ Baseline Test for Asset: ${assetId} ━━━\n`,
      'LatencyResilienceTest',
      {}
    );

    for (let i = 0; i < consumers.length; i++) {
      await this.negotiateAsset(
        controller,
        consumers[i],
        assetId,
        i,
        latencyValuesMs[i],
        true
      );
    }
  }
  // Version 1: Fixed Asset, Parallel Access
  private async fixedAssetParallelConsumerTest(
    controller: ScenarioControllerInterface,
    consumers: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >[],
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
        return this.negotiateAsset(
          controller,
          consumer,
          assetId,
          idx,
          latencyValuesMs[idx]
        );
      })
    );

    controller.log(
      'info',
      `  ✓ Fixed Asset Parallel Consumer Test completed for Asset: ${assetId}\n`,
      'LatencyResilienceTest',
      {asset: assetId}
    );
  }
  // Version 2: One Asset per Consumer, Parallel Access
  private async oneAssetPerConsumerTest(
    controller: ScenarioControllerInterface,
    consumers: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >[],
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
        await new Promise(resolve =>
          setTimeout(resolve, Math.floor(Math.random() * 999) + 2)
        );
        await this.negotiateAsset(
          controller,
          consumer,
          assets[idx],
          idx,
          latencyValuesMs[idx]
        );
      })
    );

    controller.log(
      'info',
      `  ✓ One Asset Per Consumer Test completed\n`,
      'LatencyResilienceTest',
      {}
    );
  }

  private async negotiateAsset(
    controller: ScenarioControllerInterface,
    consumer: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >,
    assetId: string,
    consumerIdx: number,
    latencyMs: number,
    baseLine = false
  ): Promise<void> {
    try {
      const catalog = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.catalogService.requestCatalogV3({
        body: {
          '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
          counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
          protocol: 'dataspace-protocol-http',
          querySpec: {
            offset: 0,
            limit: assetCount,
          },
        },
      });

      const offerPolicyContext =
        await EDCAssetCatalogHelper.getOfferPolicyDetails(assetId, catalog);
      const negotiationStopwatch = new Stopwatch();
      negotiationStopwatch.start();

      const contractNegotiationResponse = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.contractNegotiationService.initiateContractNegotiationV3(
        {
          body: {
            '@context': {
              '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
            },
            counterPartyAddress: `http://edcprovider-cp:9083/api/v1/dsp`,
            policy: offerPolicyContext.Policy,
            protocol: 'dataspace-protocol-http',
          },
        }
      );

      const Id = contractNegotiationResponse.data?.[
        '@id'
      ]?.toString() as string;
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
        throw new Error(
          `Negotiation timed out at ${negotiationStopwatch.stop()}ms under ${latencyMs}ms latency`
        );
      };

      const finalState = await waitForState(Id, 'FINALIZED');
      if (finalState === 'TERMINATED') {
        throw new Error(
          `${
            baseLine ? 'Baseline ' : ''
          }Contract negotiation was terminated at ${negotiationStopwatch.stop()}ms under ${latencyMs}ms latency`
        );
      }
      const elapsedTime = negotiationStopwatch.stop();

      const contractResponse = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.contractNegotiationService.getAgreementForNegotiationV3(
        {path: {id: Id!}}
      );

      const contractId = contractResponse.data?.['@id']?.toString() as string;

      controller.log(
        'info',
        `  ✓ ${
          baseLine ? 'Baseline ' : ''
        }Consumer ${consumerIdx} successfully negotiated contract for asset ${assetId} with contract ID: ${contractId} in ${elapsedTime}ms under ${latencyMs}ms latency\n`,
        'LatencyResilienceTest',
        {
          consumer:
            consumer.instanceController.deploymentName?.toString() ||
            consumerIdx.toString(),
          asset: assetId,
          contractId: contractId,
          negotiationTimeMs: elapsedTime.toString(),
          latency: latencyMs.toString(),
        }
      );
    } catch (error) {
      controller.log(
        'error',
        `  ✗ ${
          baseLine ? 'Baseline ' : ''
        }Consumer ${consumerIdx} failed to negotiate contract for asset ${assetId}\n`,
        'LatencyResilienceTest',
        {
          consumer:
            consumer.instanceController.deploymentName?.toString() ||
            consumerIdx.toString(),
          asset: assetId,
          latency: latencyMs.toString(),
        }
      );
    }
  }

  private async assignNetworkLatency(
    controller: ScenarioControllerInterface,
    consumers: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >,
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
        delay: {value: Math.round(latencyMs / 2), unit: 'ms'},
      },
      egress: {
        delay: {value: Math.round(latencyMs / 2), unit: 'ms'},
      },
    });
  }

  private async removeNetworkLatency(
    controller: ScenarioControllerInterface,
    consumers: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >[]
  ): Promise<void> {
    controller.log(
      'info',
      `\n━━━ Removing Network Latency from All Consumers ━━━\n`,
      'LatencyResilienceTest',
      {}
    );

    for (const consumer of consumers) {
      await (
        consumer.instanceController as SplitEDCInstance
      ).clearAllNetworkLimitations();
    }
  }
}
