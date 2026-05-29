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
 *
 */

import { Scenario, ScenarioControllerInterface } from 'dssim-core';
import { splitEdcFactory } from '../configurations/splitEdcFactory.js';
import { EDCController } from '../../../dssim-edc-controller/build/EDCController.js';


export class EDCFullFlowTest implements Scenario {
  scenario_name = 'EDC Full Flow Test - Infrastructure + Connectors + Workflow';

  async run(
    controller: ScenarioControllerInterface
  ): Promise<void> {
    console.log('\n=== EDC FULL FLOW TEST SCENARIO ===\n');

    // ============================================
    // PHASE 0: Deploy Infrastructure (Vault, PostgreSQL Not needed for Mock Connector)
    // ============================================
    // console.log('PHASE 1: Deploying infrastructure...\n');

    // const vault = vaultFactory();
    // const postgresProvider = postgresFactory('postgres-provider');
    // const postgresConsumer = postgresFactory('postgres-consumer');

    // console.log('  → Deploying PostgreSQL (Provider)...');
    // await controller.envController.deployInstance(postgresProvider);
    // console.log('  ✓ PostgreSQL Provider ready\n');

    // console.log('  → Deploying PostgreSQL (Consumer)...');
    // await controller.envController.deployInstance(postgresConsumer);
    // console.log('  ✓ PostgreSQL Consumer ready\n');

    // console.log('  → Deploying Vault...');
    // await controller.envController.deployInstance(vault);
    // console.log('  ✓ Vault ready');


    // ============================================
    // PHASE 1: Deploy EDC Connectors
    // ============================================
    console.log('PHASE 2: Deploying EDC connectors...\n');

    console.log('  → Starting EDC Provider connector...');
    const provider = await controller.startConnector(
      'username',
      'password',
      'edcprovider-cp',
      splitEdcFactory('edcprovider')
    );
    console.log('  ✓ Provider ready\n');

    console.log('  → Starting EDC Consumer connector...');
    const consumer = await controller.startConnector(
      'username',
      'password',
      'edcconsumer-cp',
      splitEdcFactory('edcconsumer')
    );
    console.log('  ✓ Consumer ready\n');

    // ============================================
    // PHASE 2: Create Asset on Provider
    // ============================================

    try {
      const assetPayload = (provider.componentController as EDCController).connectorApi.controlPlane.assetService.createAssetV3({
        asset: {
          id: 'test-asset',
          properties: {
            'id': 'test-asset',
            'name': 'Product description',
            'contenttype': 'application/json',
          },
          dataAddress: {
            properties: {
              'name': 'Test asset',
              'baseUrl': 'https://jsonplaceholder.typicode.com/users',
              'type': 'HttpData',
            },
          },
        },
      });

      const assetRes = await assetPayload;
      console.log(`  DEBUG Asset response:`, JSON.stringify(assetRes, null, 2));
      console.log(`  ✓ Asset created: ${assetRes.data?.['@id']?.toString() || 'ID not found'}\n`);
    }
    catch (error) {
      console.log(`  ⚠ Warning: Could not create asset: ${error}\n`);
    }


    // // ============================================
    // // PHASE 3: Create Policy & Contract Definition
    // // ============================================

    const policyId = 'aPolicy';

    try {
      const policyPayload = {
        id: policyId,
        policy: {
          uid: '123',
          '@type': {
            '@policytype': 'set',
          },
        },
      };

      const policyResponse = await (provider.componentController as EDCController).connectorApi.controlPlane.policyService.createPolicyDefinitionV3(policyPayload);
      console.log(`  DEBUG Policy response:`, JSON.stringify(policyResponse, null, 2));
      console.log(`  ✓ Policy definition created: ${policyResponse.data?.['@id']?.toString() || 'ID not found'}\n`);

      const contractDefPayload = {
        id: '1',
        accessPolicyId: policyId,
        contractPolicyId: policyId,
        criteria: [],
      };

      const contractDefResponse = await (provider.componentController as EDCController).connectorApi.controlPlane.contractDefinitionService.createContractDefinitionV3(
        contractDefPayload
      );
      console.log(`  DEBUG Contract Def response:`, JSON.stringify(contractDefResponse, null, 2));
      console.log(` ✓ Contract definition created: ${contractDefResponse.data?.['@id']?.toString() || 'ID not found'}\n`);

    } catch (error) {
      console.log(
        `  ⚠ Warning: Could not create policy/contract: ${error}\n`
      );
    }


    // ============================================
    // PHASE 4: Consumer queries provider catalog
    // ============================================

    try {
      var catalogRequest = (consumer.componentController as EDCController).connectorApi.controlPlane.catalogService.requestCatalogV3({
        providerUrl: `https://edcprovider-cp/api/v1/dsp`,
        querySpec: {
          offset: 0,
          limit: 50,
          sortOrder: 'DESC',
          sortField: 'createdAt',
          filterExpression: [],

        },
      });
      // var policyID = ((await catalogRequest).data 
    
      console.log(`  ✓ Consumer successfully queried provider catalog: \n`);

    } catch (error) {
      console.log(
        `  ⚠ Warning: Consumer could not query provider catalog: ${error}\n`
      );
    }


    // ============================================
    // PHASE 5: Negotiate Contract
    // ============================================

    const contractNegotiationPayload = {
      providerUrl: `https://edcprovider-cp/api/v1/dsp`,
      offer: {
        offerId: 'offer-test',
        contractOfferId: 'contract-offer-test',
        assetId: 'test-asset',
        assetName: 'test-asset',
      },
      counterPartyId: 'test-connector',
    };

    var contractId = '';
    try {
      const nego = (await consumer.componentController as EDCController).connectorApi.controlPlane.contractNegotiationService.initiateContractNegotiationV3({
        contractNegotiationPayload
      });
      const Id = (await nego).data?.['@id']?.toString()!;
      const status = (await consumer.componentController as EDCController).connectorApi.controlPlane.contractNegotiationService.getNegotiationStateV3({
        path: {
          id: Id
        }
      });

      if ((await status).data?.state == 'CONFIRMED') {
        console.log(`  ✓ Contract negotiation successful: ${Id}\n`);
      } else if ((await status).data?.state == 'TERMINATED') {
        console.log(`  ✗ Contract negotiation failed: ${Id}\n`);
        return;
      }

      var contractResponse = await (consumer.componentController as EDCController).connectorApi.controlPlane.contractNegotiationService.getAgreementForNegotiationV3({
        path: {
          id: Id
        }
      });

      contractId = contractResponse.data?.['@id']?.toString()!;
      console.log(`  ✓ Contract agreement retrieved: ${contractId}\n`);

    } catch (error) {
      console.log(
        `  ⚠ Warning: Contract negotiation failed: ${error}\n`
      );
    }


    // // ============================================
    // // PHASE 6: Negotiate Contract
    // // ============================================

    try {

      const transferPayload = {
        contractId: contractId,
        counterPartyAddress: `https://edcprovider-cp/api/v1/dsp`,
        protocol: 'dataspace-protocol-http:2025-1',
        transferType: 'HttpData-PULL'
      }
      await (consumer.componentController as EDCController).connectorApi.controlPlane.transferProcessService.initiateTransferProcessV3({
        transferPayload
      });

    } catch (error) {
      console.log(
        `  ⚠ Negotiation/Transfer phase: ${error}\n`
      );
    }

    // ============================================
    // KEEP ALIVE: Scenario stays running
    // ============================================

    await new Promise(() => {
      setInterval(() => {
      }, 30000);
    });
  }
}
