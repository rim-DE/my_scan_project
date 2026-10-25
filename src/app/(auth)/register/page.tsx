import { getT } from "@/lib/i18n/server";
import { registerAction } from "../../actions";
import { AuthForm } from "../AuthForm";

export default async function RegisterPage() {
  const t = await getT();
  return (
    <AuthForm
      action={registerAction}
      mode="register"
      t={{ title: t.auth.register, email: t.auth.email, password: t.auth.password, name: t.auth.name, switchText: t.auth.haveAccount, switchLabel: t.auth.login }}
    />
  );
}
