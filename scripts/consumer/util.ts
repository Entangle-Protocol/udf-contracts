import axios from 'axios';
import {ethers} from 'hardhat'
interface FeedValue {
    data: string;
    timestamp: number;
  }
  
  interface Feed {
    key: string;
    value: FeedValue;
    merkleProofs: string[];
  }
  
  export interface Signature {
    R: string;
    S: string;
    V: number;
  }

  
  
  interface Calldata {
    merkleRoot: string;
    signatures: Signature[];
    feeds: Feed[];
  }
  
  export interface ApiResponse {
    calldata: Calldata;
    error: string;
  }

  async function fetchData(url: string): Promise<ApiResponse> {
    try {
      const response = await axios.get<ApiResponse>(url);
      const data =response.data;
      data.calldata.feeds = data.calldata.feeds.map(feed => ({
        ...feed,
        value: {
          ...feed.value,
          data: decodeBase64(feed.value.data)
        }
      }));
      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Axios error:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
        }
      } else {
        console.error('Unknown error:', error);
      }
      throw error;
    }
  }

  export function decodeBase64ToBytes32(base64: string): string {
    const buffer = Buffer.from(base64, 'base64');
    return ethers.hexlify(buffer);
  }
  function decodeBase64(base64: string): string {
    const buffer = Buffer.from(base64, 'base64');
    const value = buffer.readBigUInt64BE(buffer.length - 8);
    return (value).toString();
  }
  
  export async function getPriceForAsset(asset: string): Promise<ApiResponse | null> {
    const baseUrl = 'https://pricefeed.entangle.fi/spotters/prices-feed1';
    const url = `${baseUrl}?assets=${asset}`;
    
    try {
      return await fetchData(url);
    } catch (error) {
      console.error('An error occurred while executing the request');
      return null;
    }
  }

//   async function main() {
//     const assets = ['NGL/USD', 'ETH/USD', 'BTC/USD']; // Пример списка активов
  
//     for (const asset of assets) {
//       await getPriceForAsset(asset);
//       console.log('---'); // Разделитель для удобства чтения
//     }
//   }