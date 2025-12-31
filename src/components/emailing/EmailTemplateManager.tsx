import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Doc } from "@/convex/_generated/dataModel";
import { Edit, Plus, Trash2 } from "lucide-react";

interface EmailTemplateManagerProps {
  templates: Doc<"emailTemplates">[];
  onEdit: (template: Doc<"emailTemplates">) => void;
  onDelete: (id: any) => void;
  onCreate: () => void;
}

export function EmailTemplateManager({
  templates,
  onEdit,
  onDelete,
  onCreate
}: EmailTemplateManagerProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Email Templates</h2>
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" /> New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card key={template._id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-medium flex justify-between items-start">
                <span className="truncate" title={template.name}>{template.name}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(template)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete({ id: template._id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">Subject: {template.subject}</p>
              <div className="text-xs text-muted-foreground line-clamp-3 bg-muted p-2 rounded">
                {template.content}
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            No templates found. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
