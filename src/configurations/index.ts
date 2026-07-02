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
import {ScenarioConfiguration} from 'dssim-core';
import {DapsController, DSCController} from 'dssim-ids-controller';
import {
  KubernetesController,
  DapsInstance,
  DSCInstance,
} from 'dssim-kubernetes-controller';
import {MyCustomIDSControllerExtension} from '../extensions/MyIdsExtionsion.js';
import fs from 'fs';
import {EDCController} from 'dssim-edc-controller';
import {edcFactory} from './edcFactory.js';
import {splitEdcFactory} from './splitEdcFactory.js';

export const pullSecret = {
  [process.env.SCECTR_CONNECTOR_IMAGE_HOSTNAME!]: {
    username: process.env.SCECTR_CONNECTOR_IMAGE_PULL_USERNAME!,
    password: process.env.SCECTR_CONNECTOR_IMAGE_PULL_PASSWORD!,
  },
};

export const dscFactory = (deploymentName: string) =>
  new DSCInstance(deploymentName, 'username', 'password', [
    {
      image:
        'registry.gitlab.cc-asp.fraunhofer.de/dssim/dssim-kubernetes-controller/ids-dataspace-connector-dssim:7.1.0',
      pullSecret: pullSecret,
    },
  ]);

const files = fs.readdirSync(`./assets/dashboards/`);
export const defaultDashboards: {
  [key: string]: string;
} = {};
files.forEach(file => {
  return (defaultDashboards[file] = fs
    .readFileSync(`./assets/dashboards/${file}`)
    .toString());
});

export const configurations: ScenarioConfiguration[] = [
  {
    name: 'minimal IDS configuration',
    environmentControllerFactory: async (): Promise<KubernetesController> =>
      await KubernetesController.createInstance(false, undefined),
    defaultConnectorInstanceFactory: dscFactory,
    ConnectorControllerType: DSCController,
    identityManagement: undefined,
  },
  {
    name: 'minimal EDC configuration',
    environmentControllerFactory: async (): Promise<KubernetesController> =>
      await KubernetesController.createInstance(false, undefined),
    defaultConnectorInstanceFactory: edcFactory,
    ConnectorControllerType: EDCController,
    identityManagement: undefined,
  },
  {
    name: 'EDC split deployment',
    environmentControllerFactory: async (): Promise<KubernetesController> =>
      await KubernetesController.createInstance(false, undefined),
    defaultConnectorInstanceFactory: splitEdcFactory,
    ConnectorControllerType: EDCController,
    identityManagement: undefined,
  },
  {
    name: 'IDS configuration with daps',
    environmentControllerFactory: async () =>
      await KubernetesController.createInstance(true, undefined),
    defaultConnectorInstanceFactory: deploymentName =>
      new DSCInstance(deploymentName, 'username', 'password', [
        {
          image:
            'registry.gitlab.cc-asp.fraunhofer.de/dssim/dssim-kubernetes-controller/ids-dataspace-connector-dssim:7.1.0',
          pullSecret: pullSecret,
        },
      ]),
    ConnectorControllerType: DSCController,
    identityManagement: {
      IdentityProviderControllerType: DapsController,
      InstanceType: DapsInstance,
    },
  },
  {
    name: 'With ConnectorController Extionsion',
    environmentControllerFactory: async (): Promise<KubernetesController> =>
      await KubernetesController.createInstance(false, undefined),
    defaultConnectorInstanceFactory: dscFactory,
    ConnectorControllerType: MyCustomIDSControllerExtension,
    identityManagement: undefined,
  },
  /*
  {
    name: 'With DockerController',
    environmentControllerFactory: async (): Promise<DockerController> =>
      DockerController(),
    defaultInstanceFactory: dscFactory,
    ConnectorControllerType: MyCustomIDSControllerExtension,
    identityManagement: undefined,
  },*/
];
