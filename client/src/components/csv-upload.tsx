import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CSVUploadProps {
  onUpload: (data: any[], headers: string[]) => void;
}

export function CSVUpload({ onUpload }: CSVUploadProps) {
  const [fileName, setFileName] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [rowCount, setRowCount] = useState<number>(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);
    setUploadStatus("idle");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = results.meta.fields || [];
          setRowCount(results.data.length);
          setUploadStatus("success");
          onUpload(results.data, headers);
        } else {
          setUploadStatus("error");
          setErrorMessage("CSV file is empty or has no valid data");
        }
      },
      error: (error) => {
        setUploadStatus("error");
        setErrorMessage(error.message);
      },
    });
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv"],
    },
    multiple: false,
  });

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Upload Product Data</CardTitle>
          <CardDescription>
            Upload a CSV file exported from Wix, WordPress, or any other platform. 
            The file should contain your product information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            {...getRootProps()}
            data-testid="dropzone-upload"
            className={`
              border-2 border-dashed rounded-md p-12 text-center cursor-pointer
              transition-colors
              ${isDragActive 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50 hover:bg-muted/50"
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              {uploadStatus === "success" ? (
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              ) : uploadStatus === "error" ? (
                <AlertCircle className="w-12 h-12 text-destructive" />
              ) : (
                <Upload className="w-12 h-12 text-muted-foreground" />
              )}
              
              <div className="space-y-2">
                {uploadStatus === "success" ? (
                  <>
                    <p className="text-lg font-medium text-foreground">
                      File uploaded successfully!
                    </p>
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <FileSpreadsheet className="w-4 h-4" />
                      <span data-testid="text-filename">{fileName}</span>
                      <span>·</span>
                      <span data-testid="text-rowcount">{rowCount} products</span>
                    </div>
                  </>
                ) : isDragActive ? (
                  <p className="text-lg font-medium text-foreground">
                    Drop your CSV file here
                  </p>
                ) : (
                  <>
                    <p className="text-lg font-medium text-foreground">
                      Drag and drop your CSV file here
                    </p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse files
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {uploadStatus === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription data-testid="text-error">
                {errorMessage || "Failed to upload CSV file. Please try again."}
              </AlertDescription>
            </Alert>
          )}

          {uploadStatus === "success" && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                CSV file processed successfully. Continue to the next step to map your fields.
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-muted/50 rounded-md p-6 space-y-3">
            <h4 className="font-medium text-sm text-foreground">CSV Format Requirements:</h4>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>File must be in CSV format (.csv)</li>
              <li>First row should contain column headers</li>
              <li>Include columns for: Product Name, SKU, Format, and Price</li>
              <li>Optional: Category/Producer, Notes, and other custom fields</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
