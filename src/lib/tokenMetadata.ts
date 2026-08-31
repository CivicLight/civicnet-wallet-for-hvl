// Converts an ipfs:// URI to a fetchable HTTPS gateway URL.
export function ipfsToGatewayUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

// Fetches a token's off-chain metadata JSON and returns its image URL
// (also converted to a fetchable gateway URL), or null on any failure.
export async function fetchTokenImageUrl(metadataUri: string): Promise<string | null> {
  try {
    const res = await fetch(ipfsToGatewayUrl(metadataUri));
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json.image !== "string") return null;
    return ipfsToGatewayUrl(json.image);
  } catch {
    return null;
  }
}
