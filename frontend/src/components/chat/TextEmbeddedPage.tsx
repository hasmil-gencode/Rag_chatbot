import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Send, Trash2 } from "lucide-react";

export const TextEmbeddedPage = () => {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [embeddings, setEmbeddings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadEmbeddings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/text-embeddings", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load');
      }
      
      const data = await response.json();
      setEmbeddings(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load embeddings error:', error);
      toast.error("Failed to load embeddings");
      setEmbeddings([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      toast.error("Please enter text");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/text-embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          text: text.trim(),
          fileName: fileName.trim() || "Custom Knowledge"
        })
      });

      const result = await response.json();
      console.log('Embed response:', response.status, result);
      
      if (response.ok) {
        toast.success("Text embedded successfully!");
        setText("");
        setFileName("");
        loadEmbeddings();
      } else {
        toast.error(result.error || "Failed to embed text");
      }
    } catch (error) {
      toast.error("Failed to embed text");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this embedding?")) return;

    try {
      const response = await fetch(`/api/text-embeddings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });

      if (response.ok) {
        toast.success("Deleted successfully");
        loadEmbeddings();
      } else {
        toast.error("Failed to delete");
      }
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  useEffect(() => {
    loadEmbeddings();
  }, []);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Text Embedded</h1>
          <p className="text-muted-foreground">
            Add knowledge directly to the vector store without uploading files.
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-card border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Display Name
            </label>
            <Input
              placeholder="e.g., Service Booking Knowledge"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Knowledge Text
            </label>
            <Textarea
              placeholder="Enter your knowledge text here...&#10;&#10;Example:&#10;Q: How to book service?&#10;A: Click [here](/form/booking-service) to book.&#10;&#10;Q: What services available?&#10;A: We offer Regular Service, Repair, and Inspection."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[300px] text-sm placeholder:text-muted-foreground/40"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Tip: Use markdown links like [click here](/form/booking-service)
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !text.trim()}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Embedding...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Embed Text
              </>
            )}
          </Button>
        </div>

        {/* Existing Embeddings */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Existing Text Embeddings</h2>
          
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : embeddings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No text embeddings yet
            </p>
          ) : (
            <div className="space-y-3">
              {embeddings.map((item) => (
                <div
                  key={item._id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{item.fileName}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {item.text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Added: {new Date(item.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item._id)}
                    className="ml-4 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
