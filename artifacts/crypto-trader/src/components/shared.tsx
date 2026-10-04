import {
  SiBitcoin,
  SiEthereum,
  SiSolana,
  SiCardano,
  SiDogecoin,
  SiPolkadot,
} from "react-icons/si";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export function formatPercent(value: number) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);

  if (value > 0) return `+${formatted}`;
  return formatted;
}

export function CoinIcon({
  symbol,
  logoUrl,
  className = "w-6 h-6",
}: {
  symbol: string;
  logoUrl?: string;
  className?: string;
}) {
  const s = symbol.toUpperCase();
  if (s === "BTC")
    return <SiBitcoin className={`${className} text-[#F7931A]`} />;
  if (s === "ETH")
    return <SiEthereum className={`${className} text-[#627EEA]`} />;
  if (s === "SOL")
    return <SiSolana className={`${className} text-[#14F195]`} />;
  if (s === "ADA")
    return <SiCardano className={`${className} text-[#0033AD]`} />;
  if (s === "DOGE")
    return <SiDogecoin className={`${className} text-[#C2A633]`} />;
  if (s === "DOT")
    return <SiPolkadot className={`${className} text-[#E6007A]`} />;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${symbol} logo`}
        className={`${className} object-contain rounded-full`}
      />
    );
  }

  return (
    <div
      className={`${className} rounded-full bg-muted flex items-center justify-center text-xs font-bold`}
    >
      {symbol[0]}
    </div>
  );
}
