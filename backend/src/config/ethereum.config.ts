import { registerAs } from "@nestjs/config";

export default registerAs("ethereum", () => ({
  rpcUrl: process.env.RPC_URL || "http://10.8.6.153:2700",
  chainId: parseInt(process.env.CHAIN_ID, 10) || 1,
  factoryAddress: process.env.FACTORY_ADDRESS || "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Uniswap V3 Factory on Ethereum mainnet
}));
