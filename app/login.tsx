import { Platform } from "react-native";
import { TVLogin } from "@/components/login/TVLogin";
import { ProfileChooser } from "@/components/profiles/ProfileChooser";

const LoginPage: React.FC = () => {
  if (Platform.isTV) {
    return <TVLogin />;
  }

  return <ProfileChooser />;
};

export default LoginPage;
