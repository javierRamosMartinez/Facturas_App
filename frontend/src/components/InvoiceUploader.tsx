import { useState } from "react";
import { Alert, Button, List, Typography, Upload } from "antd";
import {
  DeleteOutlined,
  InboxOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";

type InvoiceUploaderProps = {
  onInvoicesProcessed: (invoices: unknown[]) => void;
  token: string;
};

function InvoiceUploader({ onInvoicesProcessed, token }: InvoiceUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const addFiles = (selectedFiles: File[]) => {
    setFiles((currentFiles) => {
      const combinedFiles = [...currentFiles, ...selectedFiles];

      return combinedFiles.filter(
        (file, index, array) =>
          index ===
          array.findIndex(
            (item) =>
              item.name === file.name &&
              item.size === file.size &&
              item.lastModified === file.lastModified,
          ),
      );
    });
  };

  const removeFile = (indexToRemove: number) => {
    setFiles((currentFiles) =>
      currentFiles.filter((_, index) => index !== indexToRemove),
    );
  };

  const handleProcessFiles = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setError("");

    try {
      const processedInvoices = [];

      for (const file of files) {
        const formData = new FormData();

        formData.append("factura", file);

        const response = await fetch(
          "http://localhost:3000/api/facturas/upload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          },
        );

        if (!response.ok) {
          throw new Error(`Error procesando ${file.name}`);
        }

        const data = await response.json();

        if (data.ok && data.datosFactura) {
          processedInvoices.push(data.datosFactura);
        } else {
          throw new Error(`No se pudieron extraer los datos de ${file.name}`);
        }
      }

      console.log("Facturas procesadas:", processedInvoices);

      onInvoicesProcessed(processedInvoices);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Ha ocurrido un error procesando las facturas",
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="panel upload-panel">
      <div className="upload-hero">
        <span className="eyebrow">Nueva factura</span>
        <h2>Sube facturas nuevas en un solo paso</h2>
        <p className="panel-copy">
          Abre el explorador de archivos, selecciona uno o varios documentos y
          envíalos al análisis.
        </p>
      </div>

      <div className="action-row upload-action-row">
        <Upload
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          showUploadList={false}
          beforeUpload={(file) => {
            addFiles([file]);
            return false;
          }}
          disabled={processing}
        >
          <Button
            type="primary"
            icon={<InboxOutlined />}
            size="large"
            className="upload-cta-btn"
            disabled={processing}
          >
            Abrir explorador de archivos
          </Button>
        </Upload>
      </div>

      {files.length > 0 && (
        <div className="file-list-wrap">
          <Typography.Paragraph className="file-summary">
            {files.length}{" "}
            {files.length === 1
              ? "factura seleccionada"
              : "facturas seleccionadas"}
          </Typography.Paragraph>

          <List
            className="file-list"
            bordered
            dataSource={files}
            renderItem={(file, index) => (
              <List.Item
                actions={[
                  <Button
                    key="remove"
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    aria-label={`Eliminar ${file.name}`}
                    onClick={() => removeFile(index)}
                    disabled={processing}
                  />,
                ]}
              >
                <Typography.Text ellipsis={{ tooltip: file.name }}>
                  {file.name}
                </Typography.Text>
              </List.Item>
            )}
          />

          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleProcessFiles}
            disabled={processing}
            loading={processing}
          >
            Procesar facturas
          </Button>
        </div>
      )}

      {error && (
        <Alert
          className="error-message"
          message={error}
          type="error"
          showIcon
        />
      )}
    </section>
  );
}

export default InvoiceUploader;
