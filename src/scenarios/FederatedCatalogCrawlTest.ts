import {Scenario, ScenarioControllerInterface, delay} from 'dssim-core';
import {splitEdcFactory} from '../configurations/splitEdcFactory.js';
import {Stopwatch} from 'ts-stopwatch';
import {EDCAssetCatalogHelper} from '../helper/EDCAssetCatalogHelper.js';

const producerCount = Number(process.env.FC_PROVIDER_COUNT) || 2;
const assetsPerProducer = Number(process.env.FC_ASSETS_PER_PROVIDER) || 100;
const inCluster = process.env.INCLUSTER === '1';

const registryUrl =
  process.env.FC_REGISTRY_URL ||
  'https://services.iosb-ast.fraunhofer.de/ed-x/connector-registry/registry';

const registryApiKey =
  process.env.FC_REGISTRY_API_KEY || 'G7!m8$QzL2@rP9xVw4#sK5';

const catalogBase = inCluster
  ? 'http://edccatalog-cp:9086'
  : 'https://edccatalog-cp';

const producerDsp = (i: number) => `http://edcprovider-${i}-cp:9083/api/v1/dsp`;
const producerId = (i: number) => `did:web:edcprovider-${i}-cp%3A9083:tester`;

export class FederatedCatalogCrawlTest implements Scenario {
  scenario_name = 'EDC Federated Catalog Crawl Capacity Test';

  async run(controller: ScenarioControllerInterface): Promise<void> {
    const expectedOffers = producerCount * assetsPerProducer;
    controller.log(
      'info',
      `Starting federated catalog test: ${producerCount} producers, ` +
        `${assetsPerProducer} assets each (${expectedOffers} total)`,
      'FederatedCatalogCrawlTest',
      {}
    );

    // 1. Start producers
    const producers = await Promise.all(
      Array.from({length: producerCount}, (_, i) =>
        controller.startConnector(
          'x-api-key',
          'integration-test-key',
          `edcprovider-${i}-cp`,
          splitEdcFactory(`edcprovider-${i}`, true)
        )
      )
    );

    // 2. Create assets on each producer
    const stopwatch = new Stopwatch();
    stopwatch.start();

    await Promise.all(
      producers.map(producer =>
        EDCAssetCatalogHelper.setupProviderAssets(
          controller,
          producer,
          assetsPerProducer,
          `FederatedCatalogCrawlTest`
        )
      )
    );

    stopwatch.stop();
    controller.log(
      'info',
      `Created ${expectedOffers} assets in ${stopwatch.getTime()} ms`,
      'FederatedCatalogCrawlTest',
      {
        offers: expectedOffers.toString(),
        durationMs: stopwatch.getTime().toString(),
        szenarioEvent: 'catalogFilled',
      }
    );

    // Register producers
    // for (let i = 0; i < producerCount; i++) {
    //   await this.registerProducer(i);
    // }

    // 3. Start federated catalog connector
    await controller.startConnector(
      'x-api-key',
      'integration-test-key',
      'edccatalog-cp',
      splitEdcFactory('edccatalog', true)
    );

    await this.getconnectorRegistry(controller);
    // 4. Wait for the catalog to contain all assets
    await this.waitForCatalog(controller, expectedOffers);

    controller.log(
      'info',
      'Federated catalog crawl test complete',
      'FederatedCatalogCrawlTest',
      {}
    );
  }

  private async getconnectorRegistry(
    controller: ScenarioControllerInterface
  ): Promise<void> {
    // Check if the providers are registered
    const getConnectorResponse = await fetch(`${registryUrl}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': registryApiKey,
      },
    });

    if (!getConnectorResponse.ok) {
      throw new Error(
        `Failed to verify provider registration: HTTP ${getConnectorResponse.status}`
      );
    }

    const registeredProvider = await getConnectorResponse.json();
    controller.log(
      'info',
      `Registered provider: ${JSON.stringify(registeredProvider)}`,
      'FederatedCatalogCrawlTest',
      {szenarioEvent: 'producerRegistered'}
    );
  }

  private async registerProducer(producerIdx: number): Promise<void> {
    const body = {
      name: `edcprovider-${producerIdx}`,
      id: producerId(producerIdx),
      url: producerDsp(producerIdx),
      supportedProtocols: ['dataspace-protocol-http'],
    };

    const response = await fetch(registryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': registryApiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to register producer ${producerIdx}: HTTP ${response.status}`
      );
    }
  }

  private async waitForCatalog(
    controller: ScenarioControllerInterface,
    expectedOffers: number
  ): Promise<void> {
    const pollIntervalSeconds = 10;
    const deadline = Date.now() + 600 * 1000;

    while (Date.now() < deadline) {
      await delay(pollIntervalSeconds * 1000);

      const catalogs = await this.queryCatalog(controller);
      if (!catalogs) continue;

      const offers = catalogs.reduce((total, catalog) => {
        const datasets = catalog['dcat:dataset'] ?? catalog['dataset'];
        return (
          total + (Array.isArray(datasets) ? datasets.length : datasets ? 1 : 0)
        );
      }, 0);

      controller.log(
        'info',
        `Catalog contains ${offers}/${expectedOffers} `,
        'FederatedCatalogCrawlTest',
        {
          crawledOffers: offers.toString(),
          expectedOffers: expectedOffers.toString(),
          szenarioEvent: 'catalogPoll',
        }
      );

      if (offers >= expectedOffers) {
        controller.log(
          'info',
          `✓ Full crawl complete: ${offers}/${expectedOffers} offers`,
          'FederatedCatalogCrawlTest',
          {
            finalOffers: offers.toString(),
            expectedOffers: expectedOffers.toString(),
            szenarioEvent: 'catalogResult',
          }
        );
        return;
      }
    }

    throw new Error(
      `Federated catalog crawl timed out after 600s. ` +
        `Expected ${expectedOffers} offers.`
    );
  }

  private async queryCatalog(
    controller: ScenarioControllerInterface
  ): Promise<Record<string, unknown>[] | undefined> {
    try {
      const response = await fetch(
        `${catalogBase}/api/catalog/v1alpha/catalog/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'integration-test-key',
          },
          body: JSON.stringify({
            '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
            '@type': 'QuerySpec',
          }),
        }
      );

      if (!response.ok) {
        controller.log(
          'info',
          `Catalog query returned HTTP ${response.status}`,
          'FederatedCatalogCrawlTest',
          {}
        );
        return undefined;
      }

      const body = await response.json();

      controller.log(
        'info',
        `Catalog query returned HTTP ${response.status}: ${JSON.stringify(
          body
        )}`,
        'FederatedCatalogCrawlTest',
        {}
      );

      return (Array.isArray(body) ? body : [body]).filter(
        (value): value is Record<string, unknown> =>
          !!value && typeof value === 'object'
      );
    } catch (error) {
      controller.log(
        'warn',
        `Catalog query failed: ${error}`,
        'FederatedCatalogCrawlTest',
        {}
      );
      return undefined;
    }
  }
}
