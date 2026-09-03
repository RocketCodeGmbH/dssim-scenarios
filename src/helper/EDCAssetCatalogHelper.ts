import {ScenarioControllerInterface} from 'dssim-core';
import {EDCController} from 'dssim-edc-controller';
import {DataAddress} from 'edc-lib/management-api/asset-api';

export class EDCAssetCatalogHelper {
  static async getOfferPolicyDetails(
    assetId: string,
    catalogResponse: any
  ): Promise<{Policy: any}> {
    const catalog = catalogResponse?.data;
    const dataset = catalog?.['dcat:dataset'];
    const datasetArray = Array.isArray(dataset)
      ? dataset
      : dataset
      ? [dataset]
      : [];
    const matchedDataset = datasetArray.find((d: any) => d['@id'] === assetId);

    if (matchedDataset) {
      const offerPolicyRaw = matchedDataset['odrl:hasPolicy'];
      const offerPolicy = Array.isArray(offerPolicyRaw)
        ? offerPolicyRaw[0]
        : offerPolicyRaw;

      if (!offerPolicy || !offerPolicy['@id']) {
        throw new Error(
          `Offer policy for asset ${assetId} malformed or missing @id`
        );
      }

      const policy = {
        '@context': 'http://www.w3.org/ns/odrl.jsonld',
        '@id': offerPolicy['@id'],
        '@type': `http://www.w3.org/ns/odrl/2/Offer`,
        assigner: 'did:web:edcprovider-cp%3A9083:tester',
        target: assetId,
        ...offerPolicy,
      };

      return {Policy: policy};
    }

    throw new Error(`Asset ID ${assetId} not found in catalog`);
  }

  static async setupProviderAssets(
    controller: ScenarioControllerInterface,
    provider: Awaited<
      ReturnType<ScenarioControllerInterface['startConnector']>
    >,
    assetCount: number,
    sourceComponent: string
  ): Promise<string[]> {
    const assets: string[] = [];

    try {
      // Create assets and contract definition
      for (let i = 0; i < assetCount; i++) {
        const assetId = `Test-asset-${i}`;
        assets.push(assetId);

        const asset = await (
          provider.componentController as EDCController
        ).connectorApi.controlPlane.assetService.createAssetV3({
          body: {
            '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
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
            } as DataAddress & {baseUrl: string; name: string},
          },
        });

        // Create Policy
        await (
          provider.componentController as EDCController
        ).connectorApi.controlPlane.policyService.createPolicyDefinitionV3({
          body: {
            '@context': {
              '@vocab': 'https://w3id.org/edc/v0.0.1/ns/',
            },
            '@id': `policyId_${i}`,
            '@type': 'PolicyDefinition',
            policy: {
              '@context': 'http://www.w3.org/ns/odrl.jsonld',
              '@type': 'Set',
              permission: [
                {
                  target: assetId,
                  action: 'use',
                  constraint: [],
                },
              ],
            },
          },
        });

        // Create contract definition for this asset
        await (
          provider.componentController as EDCController
        ).connectorApi.controlPlane.contractDefinitionService.createContractDefinitionV3(
          {
            body: {
              '@context': {'@vocab': 'https://w3id.org/edc/v0.0.1/ns/'},
              '@type': 'ContractDefinition',
              '@id': `contract-def-${i}`,
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
          }
        );
      }

      controller.log(
        'info',
        `  ✓ Created ${assetCount} test assets with unrestricted policy\n`,
        sourceComponent,
        {}
      );
    } catch (error) {
      controller.log(
        'warn',
        `  ⚠ Asset setup error: ${error}\n`,
        sourceComponent,
        {}
      );
      throw error;
    }
    return assets;
  }
}