"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export function KitOverlays() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select>
        <SelectTrigger className="max-w-[200px]">
          <SelectValue placeholder="Objetivo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="weight_loss">Pérdida de peso</SelectItem>
          <SelectItem value="muscle_gain">Ganancia muscular</SelectItem>
          <SelectItem value="maintenance">Mantenimiento</SelectItem>
        </SelectContent>
      </Select>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Abrir diálogo</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diálogo de ejemplo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Modal sobre Radix Dialog con los tokens del proyecto.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
