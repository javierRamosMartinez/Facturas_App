import { useState } from "react";
import { Alert, Button, Card, Dropdown, Form, Input, Typography } from "antd";
import {
  FileSearchOutlined,
  HistoryOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import InvoiceUploader from "./components/InvoiceUploader";
import InvoiceReview from "./components/InvoiceReview";
import Dashboard from "./components/Dashboard";
import HistoryTab from "./components/HistoryTab";
import "./App.css";
import { API } from "./config";

const STORAGE_KEY = "facturas-app-token";

type AppScreen = "upload" | "consult" | "history";

function App() {
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const [authForm] = Form.useForm<{ username: string; password: string }>();
  const [screen, setScreen] = useState<AppScreen>("upload");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    null,
  );
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);

  const handleAuth = async (values: { username: string; password: string }) => {
    setLoadingAuth(true);
    setAuthError("");

    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Error de autenticación");
      }

      if (authMode === "login") {
        localStorage.setItem(STORAGE_KEY, data.token);
        setToken(data.token);
      } else {
        setAuthMode("login");
        setAuthError("Usuario creado correctamente. Ya puedes iniciar sesión.");
      }

      authForm.resetFields();
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Error de autenticación",
      );
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setInvoices([]);
    setScreen("upload");
    setSelectedHistoryId(null);
  };

  const openInvoiceDetail = (invoiceId: string) => {
    setSelectedHistoryId(invoiceId);
    setScreen("history");
  };

  if (!token) {
    return (
      <main className="auth-shell">
        {/* <div className="auth-intro" aria-hidden="true">
          <span className="auth-mark">F</span>
          <span className="auth-intro-label">Facturas · Gestión inteligente</span>
        </div> */}

        <Card className="auth-card" bordered={false}>
          <div className="auth-header">
            <span className="eyebrow">Área privada</span>
            <Typography.Title level={1}>
              {authMode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
            </Typography.Title>
            <Typography.Paragraph>
              {authMode === "login"
                ? "Accede para organizar y consultar tus facturas."
                : "Empieza a centralizar la gestión de tus facturas."}
            </Typography.Paragraph>
          </div>

          <Form
            layout="vertical"
            requiredMark={false}
            onFinish={handleAuth}
            form={authForm}
            className="auth-form"
          >
            <Form.Item
              label="Usuario"
              name="username"
              rules={[
                { required: true, message: "Introduce tu usuario" },
                {
                  min: 3,
                  message: "El usuario debe tener al menos 3 caracteres",
                },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="tu usuario"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Contraseña"
              name="password"
              rules={[
                { required: true, message: "Introduce tu contraseña" },
                {
                  min: 6,
                  message: "La contraseña debe tener al menos 6 caracteres",
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="tu contraseña"
                size="large"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loadingAuth}
            >
              {authMode === "login" ? "Iniciar sesión" : "Crear usuario"}
            </Button>

            <Button
              type="link"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setAuthError("");
              }}
            >
              {authMode === "login"
                ? "¿Necesitas una cuenta? Regístrate"
                : "Ya tengo una cuenta"}
            </Button>

            {authError && (
              <Alert
                message={authError}
                type={authError.includes("correctamente") ? "success" : "error"}
                showIcon
              />
            )}
          </Form>
        </Card>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          {/* <span className="eyebrow">Panel principal</span> */}
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              selectable: true,
              selectedKeys: [screen],
              onClick: ({ key }) => setScreen(key as AppScreen),
              items: [
                {
                  key: "upload",
                  icon: <UploadOutlined />,
                  label: "Subir nuevas",
                },
                {
                  key: "consult",
                  icon: <FileSearchOutlined />,
                  label: "Consultar facturas",
                },
                {
                  key: "history",
                  icon: <HistoryOutlined />,
                  label: "Histórico",
                },
              ],
            }}
          >
            <Button
              className="menu-trigger"
              icon={<MenuOutlined />}
              style={{ width: "100px" }}
            >
              Menú
            </Button>
          </Dropdown>
          <h1>
            {screen === "upload"
              ? "Subida de facturas"
              : screen === "history"
                ? "Histórico de facturas"
                : "Consulta de facturas"}
          </h1>
          <p>
            {screen === "upload"
              ? "Empieza aquí para cargar nuevas facturas y analizarlas."
              : screen === "history"
                ? "Consulta el listado de facturas guardadas en orden inverso de creación y edita su detalle."
                : "Revisa las facturas ya subidas y aplica filtros de búsqueda."}
          </p>
        </div>

        <div className="topbar-actions">
          <Button
            className="logout-button"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            <span className="logout-label">Cerrar sesión</span>
          </Button>
        </div>
      </header>

      {screen === "upload" ? (
        <div className="workspace-grid">
          <InvoiceUploader onInvoicesProcessed={setInvoices} token={token} />

          {invoices.length > 0 && (
            <InvoiceReview invoices={invoices as any[]} token={token} />
          )}
        </div>
      ) : screen === "history" ? (
        <HistoryTab token={token} initialSelectedId={selectedHistoryId} />
      ) : (
        <Dashboard token={token} onInvoiceSelect={openInvoiceDetail} />
      )}
    </main>
  );
}

export default App;
