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
import { Scenario, ScenarioControllerInterface, waitFor } from 'dssim-core';
import { EDCController } from 'dssim-edc-controller';
import { EDCInstance } from 'dssim-kubernetes-controller';

const kubRegSecret = {
  [process.env.SCECTR_CONNECTOR_IMAGE_HOSTNAME!]: {
    username: process.env.SCECTR_CONNECTOR_IMAGE_PULL_USERNAME!,
    password: process.env.SCECTR_CONNECTOR_IMAGE_PULL_PASSWORD!,
  },
};

export class EdcSenario implements Scenario {
  scenario_name =
    'Implementation of https://github.com/eclipse-edc/Samples/tree/main/transfer/transfer-06-consumer-pull-http';

  run = async (scenarioController: ScenarioControllerInterface) => {
    const connectors = await Promise.all([
      scenarioController.startConnector<EDCInstance, EDCController>(
        'admin',
        'password',
        'edcprovider'
      ),
      scenarioController.startConnector<EDCInstance, EDCController>(
        'admin',
        'password',
        'edcconsumer'
      ),
    ]);

    const provider = connectors[0];
    const consumer = connectors[1];
    // const dps1 =
    //   await provider.componentController.connectorApi.dataplaneSelectorService.addEntry(
    //     {
    //       //"edctype": "dataspaceconnector:dataplaneinstance",
    //       id: 'http-pull-provider-dataplane',
    //       url: `http://${provider.instanceController.hostname}/control/transfer`,
    //       allowedSourceTypes: ['HttpData'],
    //       allowedDestTypes: ['HttpProxy', 'HttpData'],
    //       properties: {
    //         publicApiUrl: `http://${provider.instanceController.hostname}:${EDCInstance.PublicEndpoint.port}${EDCInstance.PublicEndpoint.path}/`,
    //       },
    //     }
    //   );
    // scenarioController.log('debug', JSON.stringify(dps1), 'Scenario', {});

    // const dps2 =
    //   await consumer.componentController.connectorApi.dataplaneSelectorService.addEntry(
    //     {
    //       //"edctype": "dataspaceconnector:dataplaneinstance",
    //       id: 'http-pull-consumer-dataplane',
    //       url: `http://${consumer.instanceController.hostname}/control/transfer`,
    //       allowedSourceTypes: ['HttpData'],
    //       allowedDestTypes: ['HttpProxy', 'HttpData'],
    //       properties: {
    //         publicApiUrl: `http://${consumer.instanceController.hostname}:${provider.instanceController.endpoints.find(
    //           e => e.name === 'public'
    //         )?.port
    //           }${provider.instanceController.endpoints.find(
    //             e => e.name === 'public'
    //           )?.path
    //           }/`,
    //       },
    //     }
    //   );

    // scenarioController.log('debug', JSON.stringify(dps2), 'Scenario', {});

    // const asset =
    //   await provider.componentController.connectorApi.assetService.createAsset({
    //     asset: {
    //       properties: {
    //         'asset:prop:id': 'assetId',
    //         'asset:prop:name': 'product description',
    //         'asset:prop:contenttype': 'application/json',
    //       },
    //     },
    //     dataAddress: {
    //       properties: {
    //         name: 'Test asset',
    //         baseUrl: 'https://jsonplaceholder.typicode.com/users',
    //         type: 'HttpData',
    //       },
    //     },
    //   });
    // scenarioController.log('debug', JSON.stringify(asset), 'Scenario', {});

    // const policy =
    //   await provider.componentController.connectorApi.policyService.createPolicy(
    //     {
    //       id: 'aPolicy',
    //       policy: {
    //         uid: '231802-bb34-11ec-8422-0242ac120002',
    //         permissions: [
    //           {
    //             target: 'assetId',
    //             action: {
    //               type: 'USE',
    //             },
    //             edctype: 'dataspaceconnector:permission',
    //           },
    //         ],
    //         '@type': {
    //           '@policytype': 'set',
    //         },
    //       },
    //     }
    //   );
    // scenarioController.log('debug', JSON.stringify(policy), 'Scenario', {});

    // const contractDef =
    //   await provider.componentController.connectorApi.contractDefinitionService.createContractDefinition(
    //     {
    //       id: '1',
    //       accessPolicyId: 'aPolicy',
    //       contractPolicyId: 'aPolicy',
    //       criteria: [],
    //     }
    //   );
    // scenarioController.log(
    //   'debug',
    //   JSON.stringify(contractDef),
    //   'Scenario',
    //   {}
    // );

    // const description =
    //   await consumer.componentController.connectorApi.catalogService.requestCatalog(
    //     {
    //       providerUrl: `http://${provider.instanceController.hostname}:8282/api/v1/ids/data`, //TODO: Get port and path from instance
    //     }
    //   );
    // scenarioController.log(
    //   'debug',
    //   JSON.stringify(description),
    //   'Scenario',
    //   {}
    // );

    // const nego =
    //   await consumer.componentController.connectorApi.contractNegotiationService.initiateContractNegotiation(
    //     {
    //       connectorId: 'http-pull-provider',
    //       connectorAddress: `http://${provider.instanceController.hostname}:8282/api/v1/ids/data`, //TODO: Get port and path from instance
    //       protocol: 'ids-multipart',
    //       offer: {
    //         offerId: '1:50f75a7a-5f81-4764-b2f9-ac258c3628e2',
    //         assetId: 'assetId',
    //         policy: {
    //           uid: '231802-bb34-11ec-8422-0242ac120002',
    //           permissions: [
    //             {
    //               target: 'assetId',
    //               action: {
    //                 type: 'USE',
    //               },
    //               edctype: 'dataspaceconnector:permission',
    //             },
    //           ],
    //           '@type': {
    //             '@policytype': 'set',
    //           },
    //         },
    //       },
    //     }
    //   );
    // scenarioController.log('debug', JSON.stringify(nego), 'Scenario', {});

    // let contractAgreementId: string;
    // await waitFor(async () => {
    //   const negoState =
    //     await consumer.componentController.connectorApi.contractNegotiationService.getNegotiation(
    //       nego.id!
    //     );
    //   if (negoState.state === 'CONFIRMED' && negoState.contractAgreementId) {
    //     scenarioController.log(
    //       'info',
    //       `Contract negotiation ${negoState.id} is confirmed with contract agreement id ${negoState.contractAgreementId}`,
    //       'EDCScenario',
    //       {}
    //     );
    //     contractAgreementId = negoState.contractAgreementId;
    //     return true;
    //   } else {
    //     scenarioController.log(
    //       'info',
    //       `Contract negotiation ${negoState.id} is not yet confirmed`,
    //       'EDCScenario',
    //       {}
    //     );
    //     return false;
    //   }
    // });

    // const transfer =
    //   await consumer.componentController.connectorApi.transferProcessService.initiateTransfer(
    //     {
    //       connectorId: 'http-pull-provider',
    //       connectorAddress: `http://${provider.instanceController.hostname}:8282/api/v1/ids/data`, //TODO: Get port and path from instance
    //       contractId: contractAgreementId!,
    //       assetId: 'assetId',
    //       managedResources: false,
    //       dataDestination: { properties: { type: 'HttpProxy' } },
    //       protocol: 'ids-multipart',
    //       transferType: {},
    //     }
    //   );

    // scenarioController.log('debug', JSON.stringify(transfer), 'Scenario', {});

    // waitFor(async () => {
    //   const transferStatus =
    //     await consumer.componentController.connectorApi.transferProcessService.getTransferProcessState(
    //       transfer.id!
    //     );
    //   if (transferStatus.state === 'COMPLETED') {
    //     scenarioController.log('info', `Transfer complete!`, 'EDCScenario', {});
    //     return true;
    //   } else {
    //     scenarioController.log(
    //       'info',
    //       `Transfer in status ${transferStatus.state}!`,
    //       'EDCScenario',
    //       {}
    //     );
    //     return false;
    //   }
    // });
  };
}
