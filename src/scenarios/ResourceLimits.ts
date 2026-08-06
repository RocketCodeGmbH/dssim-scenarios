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
import {DSCController} from 'dssim-ids-controller';
import {DSCInstance} from 'dssim-kubernetes-controller';
import {Scenario, ScenarioControllerInterface} from 'dssim-core';

export class ResourceLimits implements Scenario {
  scenario_name = 'Enforce resource limits';
  run = async (scenarioController: ScenarioControllerInterface) => {
    const provider = await scenarioController.startConnector<
      DSCInstance,
      DSCController
    >(
      'username',
      'password',
      'provider',
      new DSCInstance(
        'provider',
        'username',
        'password',
        [
          {
            image:
              'registry.gitlab.cc-asp.fraunhofer.de/dssim/dssim-kubernetes-controller/ids-dataspace-connector-dssim:7.1.0',
            pullSecret: {
              [process.env.SCECTR_CONNECTOR_IMAGE_HOSTNAME!]: {
                username: process.env.SCECTR_CONNECTOR_IMAGE_PULL_USERNAME!,
                password: process.env.SCECTR_CONNECTOR_IMAGE_PULL_PASSWORD!,
              },
            },
          },
        ],
        {value: 2000, unit: 'M'},
        {value: 500, unit: 'milicpu'}
      ),
      DSCController
    );

    await provider.instanceController.setNetworkControl({
      ingress: {
        bandwidth: {
          value: 56,
          unit: 'kbit',
        },
      },
    });
  };
}
