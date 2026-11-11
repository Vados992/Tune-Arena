// Run locally. Never paste a private key into a website or a chat.
import {JsonRpcProvider,Wallet,ContractFactory} from 'ethers';
import {readFileSync} from 'node:fs';
if(!process.env.NFT_RPC_URL||!process.env.DEPLOYER_PRIVATE_KEY)throw new Error('Set NFT_RPC_URL and DEPLOYER_PRIVATE_KEY in your own local environment');
const provider=new JsonRpcProvider(process.env.NFT_RPC_URL),wallet=new Wallet(process.env.DEPLOYER_PRIVATE_KEY,provider);
const artifact=JSON.parse(readFileSync('contracts/artifacts/TuneArenaTrophy.json','utf8'));
const contract=await new ContractFactory(artifact.abi,artifact.bytecode,wallet).deploy(process.env.NFT_ORGANIZER_ADDRESS??wallet.address);
await contract.waitForDeployment();console.log('NFT_CONTRACT='+await contract.getAddress());console.log('NFT_CHAIN_ID='+String((await provider.getNetwork()).chainId));
