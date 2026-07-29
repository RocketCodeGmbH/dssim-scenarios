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
import './loadEnv.js';

import { GetDescription } from './scenarios/GetDescription.js';
import { DataService } from './scenarios/DataService.js';
import { ResourceLimits } from './scenarios/ResourceLimits.js';
import { ExplicitController } from './scenarios/ExplicitController.js';
import { CustomControllerExtension } from './scenarios/CustomExtension.js';
import { PISzenario } from './scenarios/ValueArtifactTransfer.js';
import { DssimCli } from './ui/cli.js';
import { runScenarioFunction } from './runFunction.js';
import { EdcSenario } from './scenarios/EDCScenario.js';
import { EDCFullFlowTest } from './scenarios/EDCFullFlowTest.js';
import { EDCScalingTest } from './scenarios/EDCScalingTest.js';
import { EDCAssetHandlingTest } from './scenarios/EDCAssetHandlingTest.js';

process.on('uncaughtException', function (exception) {
  // eslint-disable-next-line no-console
  console.error(exception);
});
process.on('unhandledRejection', (reason, p) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection at: Promise ', p, ' reason: ', reason);
});

const scenarios = [
  EDCAssetHandlingTest,
  EDCScalingTest,
  GetDescription,
  DataService,
  ResourceLimits,
  ExplicitController,
  CustomControllerExtension,
  PISzenario,
  EdcSenario,
  EDCFullFlowTest,
];

const cli = new DssimCli(scenarios, runScenarioFunction);
cli.start();
