import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import axios from "axios";
import { getNetworkConfig } from "@/lib/networks";

// USDC Contract ABI for transfer function
const USDC_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
];

// CoinGecko API configuration
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

// Get network configuration
const networkConfig = getNetworkConfig(process.env.NETWORK || "sepolia");
const PROVIDER = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

// Create axios instance with API key if available
const axiosInstance = axios.create({
  headers: COINGECKO_API_KEY
    ? { "x-cg-demo-api-key": COINGECKO_API_KEY }
    : {},
});

// Main calculation function
async function calculatePriceData(inrPrice: number) {
  // Fetch exchange rates in single API call
  const exchangeRates = await getExchangeRates();

  // Convert INR to USD using fetched rate
  const usdPrice = convertINRtoUSD(inrPrice, exchangeRates.usd_inr);

  // Estimate gas and convert to USD
  const gasEstimationEth = await estimateUSDCTransferGas();
  const gasCostUSD = gasEstimationEth * exchangeRates.eth_usd;

  // Calculate total
  const totalCostUSD = usdPrice + gasCostUSD;

  return {
    originalPrice: { inr: inrPrice, usd: usdPrice },
    gasEstimation: { eth: gasEstimationEth, usd: gasCostUSD },
    totalCostUSD,
    exchangeRates,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inrPrice } = body;

    // Validate input
    if (!inrPrice || typeof inrPrice !== "number" || inrPrice <= 0) {
      return NextResponse.json(
        { error: "Invalid INR price provided" },
        { status: 400 }
      );
    }

    // Calculate all price data
    const priceData = await calculatePriceData(inrPrice);

    // Return response
    return NextResponse.json({
      success: true,
      data: {
        ...priceData,
        network: {
          name: networkConfig.name,
          chainId: networkConfig.chainId,
          isTestnet: networkConfig.isTestnet,
          blockExplorer: networkConfig.blockExplorer,
          usdcAddress: networkConfig.tokens.usdc.address,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in calculate-prices API:", errorMessage);

    return NextResponse.json(
      {
        error: "Internal server error",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Exchange rate functions with CoinGecko API key
async function getExchangeRates(): Promise<{ usd_inr: number; eth_usd: number }> {
  try {
    const response = await axiosInstance.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids: "usd,ethereum",
        vs_currencies: "inr,usd",
      },
    });

    return {
      usd_inr: response.data.usd.inr,
      eth_usd: response.data.ethereum.usd,
    };
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
    // Fallback rates
    return {
      usd_inr: 88,
      eth_usd: 4300,
    };
  }
}

// Helper function to convert INR to USD
function convertINRtoUSD(inrAmount: number, usdInrRate: number): number {
  return inrAmount / usdInrRate;
}

// Gas estimation with better error handling
async function estimateUSDCTransferGas(): Promise<number> {
  try {
    // Get gas price and estimate gas in parallel
    const [gasPrice, estimatedGas] = await Promise.all([
      PROVIDER.getFeeData(),
      (async () => {
        const usdcContract = new ethers.Contract(
          networkConfig.tokens.usdc.address,
          USDC_ABI,
          PROVIDER
        );

        const fromAddress = "0x0000000000000000000000000000000000000002";
        const toAddress = "0x0000000000000000000000000000000000000001";
        const transferAmount = ethers.parseUnits("1", 6);

        return await usdcContract.transfer.estimateGas(
          toAddress,
          transferAmount,
          { from: fromAddress }
        );
      })(),
    ]);

    const maxFeePerGas = gasPrice.maxFeePerGas || gasPrice.gasPrice;

    if (!maxFeePerGas) {
      throw new Error("Unable to fetch gas price");
    }

    // Calculate gas cost in ETH
    const gasCostWei = estimatedGas * maxFeePerGas;
    return parseFloat(ethers.formatEther(gasCostWei));

  } catch (error) {
    console.error("Gas estimation failed, using fallback:", error);

    // Optimized fallback calculation
    const fallbackGasLimit = BigInt(65000);
    const fallbackGasPrice = ethers.parseUnits("15", "gwei");
    const fallbackCostWei = fallbackGasLimit * fallbackGasPrice;

    return parseFloat(ethers.formatEther(fallbackCostWei));
  }
}
