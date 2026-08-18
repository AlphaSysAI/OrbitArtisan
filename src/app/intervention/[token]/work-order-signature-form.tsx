"use client";

import * as React from "react";
import { toast } from "sonner";

import { signPublicWorkOrder } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function WorkOrderSignatureForm({ token }: { token: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [workPerformed, setWorkPerformed] = React.useState("");
  const [materialsUsed, setMaterialsUsed] = React.useState("");
  const [pending, setPending] = React.useState(false);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx();
    if (!ctx) return;
    setDrawing(true);
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Indiquez votre nom.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL("image/png");

    setPending(true);
    const res = await signPublicWorkOrder(token, name.trim(), signatureData, workPerformed, materialsUsed);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error === "already_signed" ? "Bon déjà signé." : "Impossible de signer.");
      return;
    }
    toast.success("Bon d'intervention signé — merci !");
    window.location.reload();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 rounded-2xl border bg-card p-6">
      <div className="space-y-2">
        <Label htmlFor="work_performed">Travaux réalisés</Label>
        <Textarea id="work_performed" value={workPerformed} onChange={(e) => setWorkPerformed(e.target.value)} rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="materials_used">Matériaux utilisés</Label>
        <Textarea id="materials_used" value={materialsUsed} onChange={(e) => setMaterialsUsed(e.target.value)} rows={2} />
      </div>
      <div className="space-y-2">
        <Label>Signature</Label>
        <canvas
          ref={canvasRef}
          width={400}
          height={160}
          className="w-full touch-none rounded-xl border bg-white"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDrawing(false)}
          onPointerLeave={() => setDrawing(false)}
        />
        <Button type="button" variant="ghost" size="sm" onClick={clearSignature}>
          Effacer la signature
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="signer_name">Nom du signataire</Label>
        <Input id="signer_name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enregistrement…" : "Signer le bon d'intervention"}
      </Button>
    </form>
  );
}
