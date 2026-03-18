import { useState, useEffect } from "react";
import { Star, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Review {
  name: string;
  rating: number;
  comment: string;
}

interface SocialProofProps {
  reviewsEnabled?: boolean;
  reviews?: Review[];
  notificationsEnabled?: boolean;
  notificationNames?: string[];
  notificationInterval?: number;
  primaryColor?: string;
}

const SocialProof = ({
  reviewsEnabled = false,
  reviews = [],
  notificationsEnabled = false,
  notificationNames = ["Maria S.", "João P.", "Ana L.", "Carlos R."],
  notificationInterval = 8,
  primaryColor,
}: SocialProofProps) => {
  const [notifIndex, setNotifIndex] = useState(0);
  const [showNotif, setShowNotif] = useState(false);

  const intervalMs = (notificationInterval || 8) * 1000;

  useEffect(() => {
    if (!notificationsEnabled || notificationNames.length === 0) return;
    const showTimer = setTimeout(() => setShowNotif(true), 3000);
    const interval = setInterval(() => {
      setShowNotif(false);
      setTimeout(() => {
        setNotifIndex((prev) => (prev + 1) % notificationNames.length);
        setShowNotif(true);
      }, 500);
    }, intervalMs);
    return () => {
      clearTimeout(showTimer);
      clearInterval(interval);
    };
  }, [notificationsEnabled, notificationNames, intervalMs]);

  return (
    <>
      {/* Reviews section */}
      {reviewsEnabled && reviews.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-warning fill-warning" />
            Avaliações de compradores
          </h3>
          <div className="space-y-2">
            {reviews.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-3 w-3 ${s <= r.rating ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-foreground">{r.name || "Anônimo"}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.comment}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Notification popup */}
      <AnimatePresence>
        {notificationsEnabled && showNotif && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: 0 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-6 z-50"
          >
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 shadow-elevated">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: primaryColor ? `${primaryColor}1a` : "hsl(var(--primary) / 0.1)" }}
              >
                <ShoppingCart className="h-4 w-4" style={{ color: primaryColor || "hsl(var(--primary))" }} />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">
                  <strong>{notificationNames[notifIndex]}</strong> acabou de comprar
                </p>
                <p className="text-[10px] text-muted-foreground">há poucos segundos</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SocialProof;
