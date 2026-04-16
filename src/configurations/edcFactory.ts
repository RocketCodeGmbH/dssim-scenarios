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
import {Endpoint} from 'dssim-core';
import {EDCInstance} from 'dssim-kubernetes-controller';
import fs from 'fs';
import {pullSecret} from './index.js';

const loadEdcKeyStoreFile = () =>
  fs.readFileSync(`./assets/edc/certs/cert.pfx`, 'base64');

const loadEdcVaultFile = () =>
  fs.readFileSync(`./assets/edc/consumer-vault.properties`).toString();

const generateEdcConfig = (hostname: string, endpoints: Endpoint[]) => {
  const ep = (name: string) => endpoints.find(e => e.name === name);
  return `edc.participant.id=urn:connector:${hostname}
edc.dsp.callback.address=http://${hostname}:${ep('protocol')?.port}${
    ep('protocol')?.path
  }/2025-1
edc.api.auth.key=password
web.http.port=${ep('health')?.port}
web.http.path=${ep('health')?.path}
web.http.management.port=${ep('datamanagement')?.port}
web.http.management.path=${ep('datamanagement')?.path}
web.http.control.port=${ep('control')?.port}
web.http.control.path=${ep('control')?.path}
web.http.protocol.port=${ep('protocol')?.port}
web.http.protocol.path=${ep('protocol')?.path}
web.http.signaling.port=${ep('signaling')?.port}
web.http.signaling.path=${ep('signaling')?.path}
edc.transfer.proxy.token.signer.privatekey.alias=1
edc.transfer.proxy.token.verifier.publickey.alias=public-key
edc.dataplane.token.validation.endpoint=http://${hostname}:${
    ep('control')?.port
  }${ep('control')?.path}/token`;
};

export const edcFactory = (deploymentName: string) =>
  new EDCInstance(
    deploymentName,
    'username',
    'password',
    generateEdcConfig,
    loadEdcKeyStoreFile(),
    loadEdcVaultFile(),
    '123456',
    [
      {
        image: 'ebaylerc/edc-connector:0.16.0',
        pullSecret: pullSecret,
      },
    ]
  );
