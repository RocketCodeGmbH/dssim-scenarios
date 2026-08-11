export class catalogHelper {
    static async getOfferPolicyDetails(
        assetId: string,
        catalogResponse: any
    ): Promise<{ Policy: any }> {

        const catalog = catalogResponse?.data;
        const dataset = catalog?.['dcat:dataset'];
        const datasetArray = Array.isArray(dataset) ? dataset : dataset ? [dataset] : [];
        const matchedDataset = datasetArray.find((d: any) => d['@id'] === assetId);

        if (matchedDataset) {
            const offerPolicyRaw = matchedDataset['odrl:hasPolicy'];
            const offerPolicy = Array.isArray(offerPolicyRaw) ? offerPolicyRaw[0] : offerPolicyRaw;


            if (!offerPolicy || !offerPolicy['@id']) {
                throw new Error(`Offer policy for asset ${assetId} malformed or missing @id`);
            }

            const policy = {
                '@context': 'http://www.w3.org/ns/odrl.jsonld',
                '@id': offerPolicy['@id'],
                '@type': `http://www.w3.org/ns/odrl/2/Offer`,
                assigner: 'did:web:edcprovider-cp%3A9083:tester',
                target: assetId,
                ...offerPolicy
            };

            return { Policy: policy };

        }

        throw new Error(`Asset ID ${assetId} not found in catalog`);
    }
}