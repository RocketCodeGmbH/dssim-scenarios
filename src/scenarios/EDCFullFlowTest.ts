/*
 * Copyright 2023 Fraunhofer IEE
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Contributors:
 *       Michel Otto - initial implementation
 *       Efrata Bayle - initial implementation
 *
 */

import {Scenario, ScenarioControllerInterface} from 'dssim-core';
import {splitEdcFactory} from '../configurations/splitEdcFactory.js';

import {EDCController} from 'dssim-edc-controller';
import {DataAddress} from 'edc-lib/management-api/asset-api';
import {ContractRequest} from 'edc-lib/management-api/contract-negotiation-api';

export class EDCFullFlowTest implements Scenario {
  scenario_name = 'EDC Full Flow Test - Infrastructure + Connectors + Workflow';

  async run(controller: ScenarioControllerInterface): Promise<void> {
    controller.log(
      'info',
      '\n=== EDC FULL FLOW TEST SCENARIO ===\n',
      'Scenario',
      {}
    );

    // ============================================
    // PHASE 0: Deploy Infrastructure (Vault, PostgreSQL Not needed for Mock Connector)
    // ============================================
    // controller.log('PHASE 1: Deploying infrastructure...\n');

    // const vault = vaultFactory();
    // const postgresProvider = postgresFactory('postgres-provider');
    // const postgresConsumer = postgresFactory('postgres-consumer');

    // controller.log('  → Deploying PostgreSQL (Provider)...');
    // await controller.envController.deployInstance(postgresProvider);
    // controller.log('  ✓ PostgreSQL Provider ready\n');

    // controller.log('  → Deploying PostgreSQL (Consumer)...');
    // await controller.envController.deployInstance(postgresConsumer);
    // controller.log('  ✓ PostgreSQL Consumer ready\n');

    // controller.log('  → Deploying Vault...');
    // await controller.envController.deployInstance(vault);
    // controller.log('  ✓ Vault ready');

    // ============================================
    // PHASE 1: Deploy EDC Connectors
    // ============================================
    controller.log(
      'info',
      'PHASE 2: Deploying EDC connectors...\n',
      'Scenario',
      {}
    );

    controller.log(
      'info',
      '  → Starting EDC Provider connector...',
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

    controller.log(
      'info',
      '  → Starting EDC Consumer connector...',
      'Scenario',
      {}
    );
    const consumer = await controller.startConnector(
      'x-api-key',
      'integration-test-key',
      'edcconsumer-cp',
      splitEdcFactory('edcconsumer')
    );
    controller.log('info', '  ✓ Consumer ready\n', 'Scenario', {});

    // trying to get regiesterd dps
    try {
      const dps = await (
        provider.componentController as EDCController
      ).connectorApi.controlPlane.controlDataplaneSelector.getAllDataPlaneInstances(
        {}
      );
      controller.log(
        'info',
        `  DEBUG Registered dataplanes at provider:` +
          JSON.stringify(dps, null, 2),
        'Scenario',
        {}
      );
    } catch (error) {
      controller.log(
        'warn',
        `  ⚠ Warning: Could not retrieve registered dataplanes at provider: ${error}\n`,
        'Scenario',
        {}
      );
      EDCFullFlowTest.keepAlive(controller);
    }

    //Creates a DP registration on both consumer and provider side. This is needed for the control plane to be able to select a DP for the transfer process later on. In this scenario, the connectors would register its dataplane on startup.
    // try {
    //   const providerDataplaneResponse = await (provider.componentController as EDCController).connectorApi.controlPlane.controlDataplaneSelector.registerDataplane({
    //     body: {
    //       "@context": {
    //         "@vocab": "https://w3id.org/edc/v0.0.1/ns/"
    //       },
    //       "@id": "edcprovider-dp",
    //       url: `http://edcprovider-dp:7082/api/control`,
    //       allowedSourceTypes: ["HttpData"],
    //       allowedDestTypes: ["HttpData", "HttpProxy"],
    //       allowedTransferTypes: ["HttpData-PULL", "HttpData-PUSH"],
    //       properties: {
    //         "publicApiUrl": "http://edcprovider-dp:7084/api/v2/public/"
    //       }
    //     } as DataPlaneInstanceSchema & { allowedTransferTypes: string[], properties: Record<string, string> },
    //     url: '/v1/dataplanes'
    //   });
    //   controller.log(`  DEBUG Provider Dataplane registration response:`, JSON.stringify(providerDataplaneResponse, null, 2));
    //   controller.log('  ✓ Provider dataplane registered\n');

    // } catch (error) {
    //   controller.log(`  ⚠ Warning: Could not register provider dataplane: ${error}\n`);
    //   EDCFullFlowTest.keepAlive(controller);
    // }

    // try {
    //   const consumerDataplaneResponse = await (consumer.componentController as EDCController).connectorApi.controlPlane.controlDataplaneSelector.registerDataplane({
    //     body: {
    //       "@context": {
    //         "@vocab": "https://w3id.org/edc/v0.0.1/ns/"
    //       },
    //       "@id": "edcconsumer-dp",
    //       url: `http://edcconsumer-dp:7082/api/control`,
    //       allowedSourceTypes: ["HttpData"],
    //       allowedDestTypes: ["HttpData", "HttpProxy"],
    //       allowedTransferTypes: ["HttpData-PULL", "HttpData-PUSH"],
    //       properties: {
    //         "publicApiUrl": "http://edcconsumer-dp:7084/api/v2/public/"
    //       }
    //     } as DataPlaneInstanceSchema & { allowedTransferTypes: string[], properties: Record<string, string> },
    //     url: '/v1/dataplanes'
    //   });
    //   controller.log(`  DEBUG Consumer dataplane response:`, JSON.stringify(consumerDataplaneResponse, null, 2));
    //   controller.log('  ✓ Consumer dataplane registered\n');
    // } catch (error) {
    //   controller.log(`  ⚠ Warning: Could not register consumer dataplane: ${error}\n`);
    //   EDCFullFlowTest.keepAlive(controller);
    // }

    // ============================================
    // PHASE 2: Create Asset on Provider
    // ============================================

    try {
      const assetPayload = (
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
          } as DataAddress & {baseUrl: string; name: string},
        },
      });

      const assetRes = await assetPayload;
      controller.log(
        'info',
        `  DEBUG Asset response:` + JSON.stringify(assetRes, null, 2),
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
      EDCFullFlowTest.keepAlive(controller);
    }

    // // ============================================
    // // PHASE 3: Create Policy & Contract Definition
    // // ============================================

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
        ` ✓ Policy Definition & Contract definition created.\n`,
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
      EDCFullFlowTest.keepAlive(controller);
    }

    // ============================================
    // PHASE 4: Consumer queries provider catalog
    // ============================================
    controller.log(
      'info',
      'PHASE 4: Consumer queries provider catalog...\n',
      'Scenario',
      {}
    );
    let catalogId = '';
    let assetId = '';
    let offerPolicy = [];
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

      controller.log(
        'info',
        `  DEBUG Catalog response:` + JSON.stringify(catalogResponse, null, 2),
        'Scenario',
        {}
      );
      const catalog = catalogResponse.data as any;
      catalogId =
        catalog?.['dcat:dataset']?.['odrl:hasPolicy']?.['@id']?.toString() ??
        '';
      assetId = catalog?.['dcat:dataset']?.['@id']?.toString() ?? '';
      offerPolicy = catalog?.['dcat:dataset']?.['odrl:hasPolicy'];
      controller.log(
        'info',
        `  ✓ Catalog queried successfully. Found asset: ${assetId} catalog: ${catalogId}\n`,
        'Scenario',
        {}
      );
    } catch (error) {
      controller.log(
        'warn',
        `  ⚠ Warning: Consumer could not query provider catalog: ${error}\n`,
        'Scenario',
        {}
      );
      EDCFullFlowTest.keepAlive(controller);
    }

    // ============================================
    // PHASE 5: Negotiate Contract
    // ============================================
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
          } as ContractRequest & {'@context': any},
        }
      );

      controller.log(
        'info',
        `  DEBUG Negotiation response:` + JSON.stringify(nego, null, 2),
        'Scenario',
        {}
      );
      const Id = nego.data?.['@id']?.toString() as string;

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
          controller.log(
            'info',
            `  → Waiting for negotiation to reach state ${targetState}... Current state: ${status.data?.state} \n`,
            'Scenario',
            {}
          );
          await new Promise(r => setTimeout(r, 1000));
        }
        throw new Error('Negotiation timed out');
      };

      const finalState = await waitForState(Id, 'FINALIZED');
      if (finalState === 'TERMINATED') {
        throw new Error('Contract negotiation was terminated');
      }

      const contractResponse = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.contractNegotiationService.getAgreementForNegotiationV3(
        {
          path: {
            id: Id!,
          },
        }
      );

      contractId = contractResponse.data?.['@id']?.toString() as string;
      controller.log(
        'info',
        `  ✓ Contract agreement retrieved: ${contractId}\n`,
        'Scenario',
        {}
      );
    } catch (error) {
      controller.log(
        'warn',
        `  ⚠ Warning: Contract negotiation failed: ${error}\n`,
        'Scenario',
        {}
      );
      EDCFullFlowTest.keepAlive(controller);
    }

    // // ============================================
    // // PHASE 5.5 : Check DP
    // // ============================================

    const dataPlaneStatus_Consumer = await (
      consumer.componentController as EDCController
    ).connectorApi.controlPlane.controlDataplaneSelector.findDataPlaneById({
      path: {
        id: 'edcconsumer-dp',
      },
    });

    const dataPlaneStatus_Provider = await (
      provider.componentController as EDCController
    ).connectorApi.controlPlane.controlDataplaneSelector.findDataPlaneById({
      path: {
        id: 'edcprovider-dp',
      },
    });

    controller.log(
      'info',
      `  DEBUG Consumer dataplane status:` +
        JSON.stringify(dataPlaneStatus_Consumer, null, 2),
      'Scenario',
      {}
    );
    controller.log(
      'info',
      `  DEBUG Provider dataplane status:` +
        JSON.stringify(dataPlaneStatus_Provider, null, 2),
      'Scenario',
      {}
    );
    controller.log(
      'info',
      `  ✓ Dataplane status retrieved successfully\n`,
      'Scenario',
      {}
    );

    // // ============================================
    // // PHASE 6: Data Transfer
    // // ============================================

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
      controller.log(
        'info',
        `  DEBUG Transfer initiation response:` +
          JSON.stringify(transferResponse, null, 2),
        'Scenario',
        {}
      );
      controller.log('info', `  ✓ Data transfer initiated\n`, 'Scenario', {});
      const id = transferResponse.data?.['@id']?.toString() as string;

      const waitForTransferState = async (
        id: string,
        targetState: string,
        maxRetries = 20
      ) => {
        for (let i = 0; i < maxRetries; i++) {
          const status = await (
            consumer.componentController as EDCController
          ).connectorApi.controlPlane.transferProcessService.getTransferProcessStateV3(
            {path: {id}}
          );

          if (
            status.data?.state === targetState ||
            status.data?.state === 'TERMINATED'
          ) {
            return status.data.state;
          }
          controller.log(
            'info',
            `  → Waiting for transfer process to reach state ${targetState}... Current state: ${status.data?.state} \n`,
            'Scenario',
            {}
          );
          await new Promise(r => setTimeout(r, 5000));
        }
        throw new Error('Transfer process timed out');
      };

      // An HttpData-PULL transfer settles in STARTED (a standing access grant),
      // not COMPLETED. Wait for STARTED, then use the EDR to pull the data from
      // the provider's public data plane API — that fetch is what "completes" a
      // pull transfer from the consumer's point of view.
      const state = await waitForTransferState(id, 'STARTED');
      if (state === 'TERMINATED') {
        throw new Error('Data transfer was terminated');
      }
      controller.log(
        'info',
        `  ✓ Transfer reached STARTED — resolving EDR and pulling data\n`,
        'Scenario',
        {}
      );

      // Resolve the EDR (provider public endpoint + bearer token) for this
      // transfer process.
      const dataAddress = await (
        consumer.componentController as EDCController
      ).connectorApi.controlPlane.edrCacheService.getEdrEntryDataAddressV3({
        path: {transferProcessId: id},
      });
      const edr = dataAddress.data as unknown as {
        endpoint?: string;
        authorization?: string;
      };
      if (!edr?.endpoint || !edr.authorization) {
        throw new Error(
          `EDR missing endpoint/authorization: ${JSON.stringify(
            dataAddress.data
          )}`
        );
      }

      // Use the EDR to pull the actual data from the provider public API.
      const dataResponse = await fetch(edr.endpoint, {
        headers: {Authorization: edr.authorization},
      });
      const body = await dataResponse.text();
      if (!dataResponse.ok) {
        throw new Error(
          `Data pull failed: HTTP ${dataResponse.status} ${body.slice(0, 300)}`
        );
      }
      controller.log(
        'info',
        `  ✓ Data pulled via EDR (HTTP ${dataResponse.status}, ${
          body.length
        } bytes):\n${body.slice(0, 500)}\n`,
        'Scenario',
        {}
      );
    } catch (error) {
      controller.log(
        'warn',
        `  ⚠ Negotiation/Transfer phase: ${error}\n`,
        'Scenario',
        {}
      );
      EDCFullFlowTest.keepAlive(controller);
    }

    // ============================================
    // Test: Query assets on provider side to check if asset creation was successful
    // ============================================
    const assetsList = await (
      provider.componentController as EDCController
    ).connectorApi.controlPlane.assetService.requestAssetsV3({});
    controller.log(
      'info',
      `  DEBUG Assets at provider:` + JSON.stringify(assetsList, null, 2),
      'Scenario',
      {}
    );

    const assetWithName = (
      provider.componentController as EDCController
    ).connectorApi.controlPlane.assetService.getAssetV3({
      path: {
        id: assetId,
      },
    });
    controller.log(
      'info',
      `  DEBUG Get asset response:` +
        JSON.stringify(await assetWithName, null, 2),
      'Scenario',
      {}
    );
    EDCFullFlowTest.keepAlive(controller);
  }

  // ============================================
  // KEEPS ALIVE: Scenario stays running
  // ============================================

  static async keepAlive(
    controller: ScenarioControllerInterface
  ): Promise<void> {
    controller.log(
      'info',
      `  → Scenario will keep running to allow debugging...\n`,
      'Scenario',
      {}
    );
    await new Promise(() => {
      setInterval(() => {}, 30000);
    });
  }
}
