import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { User, Mail, Phone, MapPin, Calendar, FileText } from "lucide-react";
import { maskCPF, maskPhone } from "@/lib/masks";

interface CheckoutFormProps {
  fieldName?: boolean;
  fieldEmail?: boolean;
  fieldCpf?: boolean;
  fieldPhone?: boolean;
  fieldBirthDate?: boolean;
  fieldAddress?: boolean;
  emailConfirmation?: boolean;
  primaryColor?: string;
  onFormChange?: (data: Record<string, string>) => void;
  onFirstInteraction?: () => void;
}

const CheckoutForm = ({
  fieldName = true,
  fieldEmail = true,
  fieldCpf = false,
  fieldPhone = false,
  fieldBirthDate = false,
  fieldAddress = false,
  emailConfirmation = false,
  primaryColor,
  onFormChange,
  onFirstInteraction,
}: CheckoutFormProps) => {
  const [form, setForm] = useState<Record<string, string>>({});
  const hasFiredInteraction = useRef(false);

  const handleFirstFocus = () => {
    if (!hasFiredInteraction.current) {
      hasFiredInteraction.current = true;
      onFirstInteraction?.();
    }
  };

  const set = (key: string, value: string) => {
    let masked = value;
    if (key === "cpf") masked = maskCPF(value);
    if (key === "phone") masked = maskPhone(value);
    const next = { ...form, [key]: masked };
    setForm(next);
    onFormChange?.(next);
  };

  const fields = [
    { key: "name", label: "Nome completo", icon: User, type: "text", placeholder: "Seu nome completo", show: fieldName },
    { key: "email", label: "E-mail", icon: Mail, type: "email", placeholder: "seu@email.com", show: fieldEmail },
    { key: "emailConfirm", label: "Confirme seu e-mail", icon: Mail, type: "email", placeholder: "Repita seu e-mail", show: fieldEmail && emailConfirmation },
    { key: "cpf", label: "CPF", icon: FileText, type: "text", placeholder: "000.000.000-00", show: fieldCpf },
    { key: "phone", label: "Telefone", icon: Phone, type: "tel", placeholder: "(00) 00000-0000", show: fieldPhone },
    { key: "birthDate", label: "Data de nascimento", icon: Calendar, type: "date", placeholder: "", show: fieldBirthDate },
    { key: "address", label: "Endereço completo", icon: MapPin, type: "text", placeholder: "Rua, número, bairro, cidade - UF", show: fieldAddress },
  ];

  const activeFields = fields.filter((f) => f.show);

  return (
    <div className="space-y-4" onFocus={handleFirstFocus}>
      <div className="flex items-center gap-2 mb-1">
        <User className="h-4 w-4" style={primaryColor ? { color: primaryColor } : undefined} />
        <h3 className="font-semibold text-sm text-foreground">Dados pessoais</h3>
      </div>
      <div className="space-y-3">
        {activeFields.map((f, i) => (
          <motion.div
            key={f.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="space-y-1.5"
          >
            <Label htmlFor={`checkout-${f.key}`} className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
              <f.icon className="h-3 w-3" />
              {f.label}
            </Label>
            <Input
              id={`checkout-${f.key}`}
              type={f.type}
              placeholder={f.placeholder}
              value={form[f.key] || ""}
              onChange={(e) => set(f.key, e.target.value)}
              className="h-10 text-sm"
              style={primaryColor ? { "--tw-ring-color": primaryColor } as React.CSSProperties : undefined}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default CheckoutForm;
