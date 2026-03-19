import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getBaseUrl } from "@/lib/get-base-url";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AuthLayout from "@/components/layout/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import TermsAndPrivacy from "@/components/shared/TermsAndPrivacy";
import { useTermsSettings } from "@/hooks/useTermsSettings";
import Turnstile, { getTurnstileSiteKey } from "@/components/shared/Turnstile";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "O nome deve ter pelo menos 3 caracteres.")
      .max(100, "O nome deve ter no máximo 100 caracteres."),
    email: z
      .string()
      .trim()
      .email("Insira um e-mail válido.")
      .max(255, "O e-mail deve ter no máximo 255 caracteres."),
    password: z
      .string()
      .min(10, "A senha deve ter pelo menos 10 caracteres.")
      .regex(/[a-z]/, "A senha deve conter pelo menos uma letra minúscula.")
      .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiúscula.")
      .regex(/[0-9]/, "A senha deve conter pelo menos um número.")
      .regex(
        /[[!@#$%^&*()_+\-=\]{};':"\\|<>?,./`~]/,
        "A senha deve conter pelo menos um caractere especial."
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

const Register = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn, signUp } = useAuth();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const { requireAcceptance } = useTermsSettings();
  const turnstileSiteKey = getTurnstileSiteKey();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  const onSubmit = async (values: RegisterFormValues) => {
    const redirectTo = `${getBaseUrl()}/auth/email-verified?login=/auth/login`;
    const { error, requiresEmailVerification } = await signUp(
      values.email,
      values.password,
      values.name,
      "seller",
      redirectTo,
      turnstileToken
    );

    if (error) {
      toast({ title: "Erro", description: error.message || "Erro ao criar conta.", variant: "destructive" });
      return;
    }

    if (requiresEmailVerification) {
      toast({ title: "Conta criada!", description: "Verifique seu e-mail para confirmar o cadastro." });
      navigate("/auth/email-confirmation?login=/auth/login");
      return;
    }

    const { error: signInError } = await signIn(values.email, values.password, { turnstileToken });
    if (signInError) {
      toast({
        title: "Conta criada!",
        description: "Cadastro concluído, mas não foi possível entrar automaticamente. Faça login para continuar.",
      });
      navigate("/auth/login");
      return;
    }

    const { supabase } = await import("@/integrations/supabase/client");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const mfaPending = Boolean((session as any)?.mfa_pending);
    const mfaSetupRequired = Boolean((session as any)?.mfa_setup_required);

    toast({ title: "Conta criada!", description: "Bem-vindo." });
    navigate(mfaPending ? (mfaSetupRequired ? "/auth/2fa/setup" : "/auth/2fa") : "/app/dashboard");
  };

  return (
    <AuthLayout title="Crie sua conta" subtitle="Informe seus dados para continuar.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome completo</FormLabel>
                <FormControl>
                  <Input placeholder="Seu nome" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="seu@email.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl>
                   <PasswordInput placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmar senha</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <TermsAndPrivacy
            mode="register"
            checked={acceptedTerms}
            onCheckedChange={setAcceptedTerms}
          />

          <Turnstile onToken={setTurnstileToken} />

          <Button
            type="submit"
            className="w-full"
            disabled={
              form.formState.isSubmitting ||
              (requireAcceptance && !acceptedTerms) ||
              (Boolean(turnstileSiteKey) && !turnstileToken)
            }
          >
            {form.formState.isSubmitting ? "Criando..." : "Criar conta"}
          </Button>


          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/auth/login" className="text-primary hover:underline font-medium">
              Entrar
            </Link>
          </p>

          <Separator className="my-4" />

          <p className="text-center text-sm text-muted-foreground">
            Quer comprar e acessar seus cursos?{" "}
            <Link to="/buyer/register" className="text-primary hover:underline font-medium">
              Crie uma conta de cliente
            </Link>
            .
          </p>
        </form>
      </Form>
    </AuthLayout>
  );
};

export default Register;
