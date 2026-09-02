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
import {EDCInstance, SplitEDCInstance} from 'dssim-kubernetes-controller';
import fs from 'fs';
import {pullSecret} from './index.js';

export const splitEdcFactory = (
  deploymentName: string,
  federatedCatalog = false
) => {
  const RegistryUrl = process.env.FC_REGISTRY_URL
    ? process.env.FC_REGISTRY_URL
    : 'https://services.iosb-ast.fraunhofer.de/ed-x/connector-registry/registry';

  const registryKey = process.env.FC_REGISTRY_API_KEY;

  const loadEdcKeyStoreFile = () =>
    fs.readFileSync('./assets/edc/certs/cert.pfx', 'base64');

  const loadEdcVaultFile = () =>
    fs.readFileSync('./assets/edc/consumer-vault.properties').toString();

  // The data plane image ships with EDC's InMemoryVault (no vault-filesystem
  // extension), so the mounted vault file is never read. Both signing and
  // verification keys must therefore come from the FS Configuration, but via
  // two different mechanisms:
  //   - private signer key: AbstractPrivateKeyResolver falls back to
  //     config.getString(alias), so it's a property named after the alias
  //     (signer-key=...).
  //   - public verifier key: LocalPublicKeyService only reads its cache (seeded
  //     from edc.iam.publickeys.<n>.id/.value) then the vault — there is no
  //     plain-property fallback, so it must be registered as edc.iam.publickeys.
  // PEM newlines are escaped to '\r\n' so java.util.Properties reconstructs a
  // valid multi-line PEM when the config file is loaded.
  const loadPemAsProperty = (path: string) =>
    fs.readFileSync(path).toString().replace(/\r?\n/g, '\\r\\n');

  // TODO: Future enhancement - enable vault and postgres when needed
  // import {PostgreSQLInstance, VaultInstance } from 'dssim-kubernetes-controller';

  const generateCpConfig = (cpHostname: string, cpEndpoints: Endpoint[]) => {
    const port = (name: string) => cpEndpoints.find(e => e.name === name)?.port;
    return `
edc.participant.id=did:web:${cpHostname}%3A9083:tester
edc.component.id=tester-connector
edc.hostname=${cpHostname}
edc.dsp.callback.address=http://${cpHostname}:${port('protocol')}/api/v1/dsp

edc.iam.issuer.id=did:web:${cpHostname}%3A9083:tester
edc.iam.did.web.use.https=true
edc.iam.sts.oauth.token.url=http://sts:10083/api/sts/token
edc.iam.sts.oauth.client.id=did:web:${cpHostname}%3A9083:tester
edc.iam.sts.oauth.client.secret.alias=tester-sts-client-secret
edc.iam.credential.revocation.mimetype=application/json
edc.iam.trusted-issuer.0.id=did:web:issuer%3A20085:issuer


edc.vault.hashicorp.url=http://vault:8200
edc.vault.hashicorp.token=devpass

edc.policy.monitor.state-machine.iteration-wait-millis=30000

web.http.path=/api
web.http.port=${port('health')}
web.http.management.path=/api/management
web.http.management.port=${port('management')}
web.http.management.auth.type=tokenbased
web.http.management.auth.key=integration-test-key
web.http.control.path=/api/control
web.http.control.port=${port('control')}
web.http.protocol.path=/api/v1/dsp
web.http.protocol.port=${port('protocol')}
web.http.version.path=/api/version
web.http.version.port=${port('version')}
web.http.catalog.path=/api/catalog
web.http.catalog.port=${port('catalog')}


// edc.sql.schema.autocreate=true
// edc.datasource.default.user=edc
// edc.datasource.default.password=devpass
// edc.datasource.default.url=jdbc:postgresql://postgreshost:5432/edc

edc.catalog.cache.execution.enabled=${federatedCatalog}
edc.catalog.registry.enabled=${federatedCatalog}
edc.catalog.registry.url=${RegistryUrl}
edc.catalog.registry.api.key=${registryKey}
edc.catalog.cache.execution.period.seconds=${federatedCatalog ? 30000 : 30}
edc.catalog.cache.execution.delay.seconds=10
edc.catalog.cache.partition.num.crawlers=3

edc.registration.registry.enabled=${federatedCatalog}
edc.registration.participant.context.enabled=false
edc.registration.membership.issuance.enabled=false
edc.registration.marketpartner.issuance.enabled=false
edc.registration.connector.name= ${cpHostname}
edc.registration.registry.url=${RegistryUrl}
edc.registration.registry.api.key=${registryKey}
edc.registration.keys.name.overwrite=${cpHostname}
edc.registration.registry.auto=false
edc.registration.ih.identity.url=http://identity-hub:10082/api/identity
edc.registration.ih.credentials.url=http://identity-hub:10081/api/credentials
edc.registration.issuer.did=did:web:issuer%3A20085:issuer

edc.policy.pm.url=https://api-nprd.traxes.io/prprd/forwatt/v2
edc.policy.pm.token.url=https://acc.signin.energy/am/oauth2/realms/root/realms/difesp/access_token
edc.policy.pm.token.client.id=esp_FraunhoferPermissionCZ1MsY_001
edc.policy.pm.token.client.secret.alias=pm-secret`;
  };

  const generateDpConfig = (
    dpHostname: string,
    cpHostname: string,
    dpEndpoints: Endpoint[]
  ) => {
    const dpPort = (name: string) =>
      dpEndpoints.find(e => e.name === name)?.port;
    const cpControlPort = SplitEDCInstance.CpEndpoints.find(
      e => e.name === 'control'
    )?.port;
    return `
    edc.participant.id=did:web:${dpHostname}:tester
    edc.component.id=tester-connector
    edc.hostname=${dpHostname}


    edc.vault.hashicorp.url=http://vault:8200
    edc.vault.hashicorp.token=devpass

    edc.dpf.selector.url=http://${cpHostname}:${cpControlPort}/api/control/v1/dataplanes
    edc.dataplane.api.public.baseurl=http://${dpHostname}:${dpPort(
      'public'
    )}/api/v2/public

    edc.transfer.proxy.token.signer.privatekey.alias=signer-key
    edc.transfer.proxy.token.verifier.publickey.alias=verifier-key

    signer-key=${loadPemAsProperty('./assets/edc/certs/key.pem')}
    edc.iam.publickeys.0.id=verifier-key
    edc.iam.publickeys.0.value=${loadPemAsProperty(
      './assets/edc/certs/public.pem'
    )}

    web.http.path=/api
    web.http.port=${dpPort('health')}
    web.http.control.path=/api/control
    web.http.control.port=${dpPort('control')}
    web.http.public.path=/api/v2/public
    web.http.public.port=${dpPort('public')}

    // edc.sql.schema.autocreate=true
    // edc.datasource.default.user=edc
    // edc.datasource.default.password=devpass
    // edc.datasource.default.url=jdbc:postgresql://postgreshost:5432/edc
    `.trim();
  };
  return new SplitEDCInstance(
    deploymentName,
    'username',
    'password',
    (cpHostname: string, cpEndpoints: Endpoint[]) =>
      generateCpConfig(cpHostname, cpEndpoints),
    (dpHostname: string, cpHostname: string, dpEndpoints: Endpoint[]) =>
      generateDpConfig(dpHostname, cpHostname, dpEndpoints),
    loadEdcKeyStoreFile(),
    loadEdcVaultFile(),
    '123',
    {
      // This image does not have the federated catalog feature enabled
      //image: 'otmi100/connector-controlplane-mock:0.14.0-inmem-1',
      image: 'ebaylerc/ctrlplane-federated-catalog:dev',
      pullSecret: pullSecret,
    },
    // {
    //   image: 'otmi100/connector-dataplane:0.14.0',
    //   pullSecret: pullSecret,
    // }
    {
      image: 'ebaylerc/dataplane-inmem:latest',
      pullSecret: pullSecret,
    }
  );
};

// export const postgresFactory = (deploymentName: string = 'postgres') =>
//   new PostgreSQLInstance(deploymentName, 'edc', 'edc', 'devpass', {
//     image: 'postgres:15',
//     pullSecret: undefined,
//   });

// export const vaultFactory = (deploymentName: string = 'vault') =>
//   new VaultInstance(deploymentName, 'devpass', {
//     image: 'hashicorp/vault:2.0',
//     pullSecret: undefined,
//   });
