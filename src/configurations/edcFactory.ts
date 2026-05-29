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
import { Endpoint } from 'dssim-core';
import { EDCInstance} from 'dssim-kubernetes-controller';
import fs from 'fs';
import { pullSecret } from './index.js';

const loadEdcKeyStoreFile = () =>
  fs.readFileSync(`./assets/edc/certs/cert.pfx`, 'base64');

const loadEdcVaultFile = () =>
  fs.readFileSync(`./assets/edc/consumer-vault.properties`).toString();

const generateEdcConfig = (hostname: string, endpoints: Endpoint[]) => {
  console.log('Available endpoint names:', endpoints.map(e => e.name));
  return `edc.participant.id=urn:connector:${hostname}
edc.hostname=${hostname}
edc.dsp.callback.address=http://${hostname}:${endpoints.find(e => e.name === 'protocol')?.port}/api/dsp/2025-1
edc.api.auth.key=integration-test-key
web.http.port=${endpoints.find(e => e.name === 'health')?.port}
web.http.path=/api
web.http.management.port=${endpoints.find(e => e.name === 'management')?.port}
web.http.management.path=/api/management
web.http.protocol.port=${endpoints.find(e => e.name === 'protocol')?.port}
web.http.protocol.path=/api/dsp
web.http.signaling.port=${endpoints.find(e => e.name === 'signaling')?.port}
web.http.signaling.path=/api/signaling
web.http.control.port=${endpoints.find(e => e.name === 'control')?.port}
web.http.control.path=/api/control
web.http.public.port=${endpoints.find(e => e.name === 'public')?.port}
web.http.public.path=/public
edc.transfer.proxy.token.signer.privatekey.alias=1
edc.transfer.proxy.token.verifier.publickey.alias=public-key
edc.dataplane.token.validation.endpoint=http://${hostname}:${endpoints.find(e => e.name === 'control')?.port}/api/control/token
edc.receiver.http.endpoint=http://dataservice:4000/receiver/urn:connector:provider/callback`;
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
        image:
          'ebaylerc/edc-connector:0.14.0',
        pullSecret: pullSecret,
      },
    ]
  );