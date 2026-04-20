import React from "react";
import {
  LoginPage as PFLoginPage,
  LoginForm,
  ListVariant,
} from "@patternfly/react-core";
import { useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "src/store/store";
import { loginUser } from "src/store/authSlice";

const LoginPage: React.FC = () => {
  React.useEffect(() => {
    document.title = "Dogtag PKI - Login";
  }, []);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((s) => s.auth);

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch(loginUser({ username, password }));
    if (loginUser.fulfilled.match(result)) {
      navigate("/");
    }
  };

  return (
    <PFLoginPage
      loginTitle="Log in to Dogtag PKI"
      loginSubtitle="Enter your credentials to access the Certificate Authority."
      textContent="Dogtag PKI Certificate System provides enterprise-class certificate lifecycle management including issuance, revocation, and renewal."
      signUpForAccountMessage={
        <span>
          Demo accounts: <strong>caadmin</strong> (admin+agent),{" "}
          <strong>agent1</strong> (agent), <strong>auditor1</strong> (auditor)
        </span>
      }
    >
      <LoginForm
        showHelperText={status === "failed"}
        helperText={error ?? "Invalid credentials"}
        helperTextIcon={undefined}
        usernameLabel="Username"
        usernameValue={username}
        onChangeUsername={(_e, val) => setUsername(val)}
        passwordLabel="Password"
        passwordValue={password}
        onChangePassword={(_e, val) => setPassword(val)}
        isShowPasswordEnabled
        showPasswordAriaLabel="Show password"
        hidePasswordAriaLabel="Hide password"
        onLoginButtonClick={handleSubmit}
        loginButtonLabel="Log in"
        isLoginButtonDisabled={status === "loading" || !username || !password}
      />
    </PFLoginPage>
  );
};

export default LoginPage;
