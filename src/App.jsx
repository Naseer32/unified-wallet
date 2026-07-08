import { useState, useEffect, useMemo } from "react";

let liveWallet = null;
let liveModulePromise = null;

function loadLiveModule() {
  if (!liveModulePromise) {
    liveModulePromise = import("./wallet.js")
      .then((w) => {
        liveWallet = w;
        return true;
      })
      .catch(() => false);
  }
  return liveModulePromise;
}

const CHAINS = [
  { id: "Base_Sepolia", label: "Base" },
  { id: "Arbitrum_Sepolia", label: "Arbitrum" },
  { id: "Solana_Devnet", label: "Solana" },
  { id: "Arc_Testnet", label: "Arc" },
  { id: "Ethereum_Sepolia", label: "Ethereum" },
];

function formatUSDC(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [walletAdapter, setWalletAdapter] = useState(null);
  const [sources, setSources] = useState({});
  const [log, setLog] = useState([]);
  const [depositChain, setDepositChain] = useState("Base_Sepolia");
  const [depositAmount, setDepositAmount] = useState("25.00");
  const [spendChain, setSpendChain] = useState("Arc_Testnet");
  const [spendAmount, setSpendAmount] = useState("10.00");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveMode, setLiveMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadLiveModule().then((ok) => { if (mounted) setLiveMode(ok); });
    return () => { mounted = false; };
  }, []);

  const confirmedTotal = useMemo(() => Object.values(sources).reduce((a, b) => a + b, 0), [sources]);

  function addLog(entry) {
    setLog((l) => [{ ...entry, ts: new Date().toLocaleTimeString() }, ...l].slice(0, 12));
  }

  async function refreshBalances(addr) {
    if (!liveMode || !addr) return;
    try {
      const data = await liveWallet.getBalances(addr);
      const byChain = {};
      for (const row of data.byChain || []) {
        byChain[row.chain] = parseFloat(row.confirmedBalance ?? row.balance ?? 0);
      }
      setSources(byChain);
    } catch (err) {
      addLog({ kind: "error", text: `Balance refresh failed: ${err.message}` });
    }
  }

  async function connect() {
    if (!liveMode) {
      addLog({ kind: "error", text: "Wallet SDK not loaded yet — try again in a moment" });
      return;
    }
    setBusy(true);
    try {
      const { adapter, address: addr } = await liveWallet.connectMetaMask();
      setWalletAdapter(adapter);
      setAddress(addr);
      setConnected(true);
      addLog({ kind: "connect", text: `Connected MetaMask · ${addr.slice(0, 6)}…${addr.slice(-4)}` });
      await refreshBalances(addr);
    } catch (err) {
      addLog({ kind: "error", text: `Connection failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeposit(e) {
    e.preventDefault();
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setBusy(true);
    addLog({ kind: "pending", text: `Depositing ${formatUSDC(amt)} USDC from ${CHAINS.find(c => c.id === depositChain).label}…` });
    try {
      const result = await liveWallet.deposit({ adapter: walletAdapter, chain: depositChain, amount: depositAmount });
      addLog({ kind: "confirmed", text: `Confirmed: ${formatUSDC(amt)} USDC · ${result.explorerUrl || result.txHash || "sent"}` });
      await refreshBalances(address);
    } catch (err) {
      addLog({ kind: "error", text: `Deposit failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleSpend(e) {
    e.preventDefault();
    const amt = parseFloat(spendAmount);
    if (!amt || amt <= 0 || !recipient) {
      addLog({ kind: "error", text: "Enter an amount and recipient address" });
      return;
    }
    setBusy(true);
    try {
      const estimate = await liveWallet.estimateSpend({ adapter: walletAdapter, toChain: spendChain, recipientAddress: recipient, amount: spendAmount });
      const gasFee = estimate.fees?.find(f => f.type === "gasFee")?.amount ?? "0";
      addLog({ kind: "pending", text: `Estimated fee: ${gasFee} USDC — confirm in wallet` });
      const result = await liveWallet.spend({ adapter: walletAdapter, toChain: spendChain, recipientAddress: recipient, amount: spendAmount });
      addLog({ kind: "confirmed", text: `Sent ${formatUSDC(amt)} USDC · ${result.explorerUrl || result.transferId || "sent"}` });
      await refreshBalances(address);
    } catch (err) {
      addLog({ kind: "error", text: `Spend failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F0D", color: "#EAF4EC", fontFamily: "monospace", padding: 20 }}>
      <h1>Unified Wallet {liveMode ? "· live" : "· loading…"}</h1>
      {!connected ? (
        <button onClick={connect} disabled={busy} style={{ padding: "12px 20px", background: "#4F7A5C", border: "none", borderRadius: 6, fontWeight: 600 }}>
          {busy ? "Connecting…" : "Connect MetaMask"}
        </button>
      ) : (
        <>
          <p>Connected: {address}</p>
          <h2>${formatUSDC(confirmedTotal)}</h2>

          <form onSubmit={handleDeposit} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
            <b>Deposit</b>
            <select value={depositChain} onChange={e => setDepositChain(e.target.value)}>
              {CHAINS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
            <button type="submit" disabled={busy}>Deposit</button>
          </form>

          <form onSubmit={handleSpend} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
            <b>Spend</b>
            <select value={spendChain} onChange={e => setSpendChain(e.target.value)}>
              {CHAINS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input placeholder="Recipient address" value={recipient} onChange={e => setRecipient(e.target.value)} />
            <input type="number" value={spendAmount} onChange={e => setSpendAmount(e.target.value)} />
            <button type="submit" disabled={busy}>Spend</button>
          </form>

          <div style={{ marginTop: 20 }}>
            {log.map((l, i) => <div key={i} style={{ fontSize: 12, padding: "4px 0" }}>{l.text}</div>)}
          </div>
        </>
      )}
    </div>
  );
              }
