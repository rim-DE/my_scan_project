import { getT } from "@/lib/i18n/server";
import { loginAction } from "../../actions";
import { AuthForm } from "../AuthForm";

export default async function LoginPage() {
  const t = await getT();
  return (
    <AuthForm
      action={loginAction}
      mode="login"
      t={{ title: t.auth.login, email: t.auth.email, password: t.auth.password, name: t.auth.name, switchText: t.auth.noAccount, switchLabel: t.auth.register }}
    />
  );
}
