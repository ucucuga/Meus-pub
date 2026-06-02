import { Address, toNano } from '@ton/core';
import { Meus, MeusConfig, COMMISSION_WALLET } from '../wrappers/Meus';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const config: MeusConfig = {
        employer:   Address.parse('EMPLOYER_ADDRESS_HERE'),
        freelancer: Address.parse('FREELANCER_ADDRESS_HERE'),
        arbiter:    Address.parse('ARBITER_ADDRESS_HERE'),
        deployer:   provider.sender().address!,
        amount:     toNano('10'),
        deadline:   Math.floor(Date.now() / 1000) + 7 * 86400,
    };

    const meus = provider.open(
        Meus.createFromConfig(config, await compile('Meus')),
    );

    await meus.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(meus.address);

    console.log('Escrow deployed at:       ', meus.address.toString());
    console.log('Commission wallet (code): ', COMMISSION_WALLET.toString());
    console.log('Commission rate:           3%');
    console.log('Escrow amount:            ', config.amount.toString(), 'nanoTON');
}
