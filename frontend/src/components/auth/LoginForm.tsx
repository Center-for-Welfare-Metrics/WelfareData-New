"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Lock, Mail, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const loginSchema = z.object({
  email: z.string().email("Endereço de e-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    try {
      await login(data);
      toast.success("Sessão inicializada com sucesso");
      router.push("/");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? "Falha ao conectar com o servidor";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Identificação
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            placeholder="operador@welfaredata.org"
            autoComplete="email"
            className={cn(
              "h-11 pl-10 bg-background border-border/60 font-mono text-sm",
              "focus-visible:ring-primary/50 focus-visible:border-primary/60",
              errors.email && "border-destructive focus-visible:ring-destructive/30"
            )}
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3" />
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Chave de Acesso
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(
              "h-11 pl-10 bg-background border-border/60 font-mono text-sm",
              "focus-visible:ring-primary/50 focus-visible:border-primary/60",
              errors.password && "border-destructive focus-visible:ring-destructive/30"
            )}
            {...register("password")}
          />
        </div>
        {errors.password && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3" />
            {errors.password.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 font-mono text-xs uppercase tracking-[0.2em]"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Autenticando...
          </>
        ) : (
          "Inicializar Sessão"
        )}
      </Button>
    </form>
  );
}
