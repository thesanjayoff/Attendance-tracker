"use client";

import { useState, useTransition } from "react";
import { checkInAction, checkOutAction } from "../../actions/attendance";
import { Button } from "../../../components/ui/Button";

export function CheckInOutCard({ checkedInAt, checkedOutAt, geofenceEnabled }: { checkedInAt: string | null; checkedOutAt: string | null; geofenceEnabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCheckIn() {
    setError(null);
    if (!geofenceEnabled) {
      startTransition(async () => {
        try {
          await checkInAction();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Check-in failed.");
        }
      });
      return;
    }
    if (!navigator.geolocation) {
      setError("Location services are not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startTransition(async () => {
          try {
            await checkInAction({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Check-in failed.");
          }
        });
      },
      () => setError("Location permission is required to check in."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleCheckOut() {
    setError(null);
    startTransition(async () => {
      try {
        await checkOutAction();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Check-out failed.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500 dark:text-slate-400">Checked in</span>
        <span className="font-medium text-slate-900 dark:text-white">{checkedInAt ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500 dark:text-slate-400">Checked out</span>
        <span className="font-medium text-slate-900 dark:text-white">{checkedOutAt ?? "—"}</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!checkedInAt && (
        <Button className="w-full" onClick={handleCheckIn} disabled={pending}>
          Check in
        </Button>
      )}
      {checkedInAt && !checkedOutAt && (
        <Button className="w-full" variant="secondary" onClick={handleCheckOut} disabled={pending}>
          Check out
        </Button>
      )}
      {checkedInAt && checkedOutAt && <p className="text-center text-sm text-slate-500">Done for today 🎉</p>}
    </div>
  );
}
