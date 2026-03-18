import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import LoadingState from "@/components/shared/LoadingState";
import {
  useCourseByProduct, useCreateCourse,
  useCourseModules, useCreateCourseModule, useDeleteCourseModule,
  useCourseLessons, useCreateCourseLesson, useDeleteCourseLesson,
} from "@/hooks/useProducts";
import { updateCourseLesson, updateCourseModule } from "@/services/product.service";
import {
  Save, Plus, Trash2, GripVertical, ChevronDown, BookOpen, Loader2, Eye,
} from "lucide-react";

import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  productId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

type LessonEdits = Record<string, Partial<{ title: string; duration: string; video_url: string }>>;

/* ── Lesson Row ── */
const ModuleLessons = ({
  moduleId, courseId, pendingEdits, onEditLesson,
}: {
  moduleId: string; courseId: string;
  pendingEdits: LessonEdits;
  onEditLesson: (lessonId: string, field: string, value: string) => void;
}) => {
  const { data: lessons = [], isLoading } = useCourseLessons(moduleId);
  const createLesson = useCreateCourseLesson(moduleId, courseId);
  const deleteLesson = useDeleteCourseLesson(moduleId);

  if (isLoading) return <div className="py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-2">
      {lessons.map((lesson, li) => {
        const edits = pendingEdits[lesson.id] || {};
        return (
          <div key={lesson.id} className="rounded-lg border border-border p-3 space-y-3 relative">
            <button
              onClick={() => deleteLesson.mutate(lesson.id)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />
              <span className="text-xs text-muted-foreground font-medium">Aula {li + 1}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Título</Label>
                <Input
                  value={edits.title ?? lesson.title}
                  onChange={(e) => onEditLesson(lesson.id, "title", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duração</Label>
                <Input
                  value={edits.duration ?? lesson.duration ?? "00:00"}
                  onChange={(e) => onEditLesson(lesson.id, "duration", e.target.value)}
                  placeholder="mm:ss"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL do vídeo</Label>
              <Input
                value={edits.video_url ?? lesson.video_url ?? ""}
                onChange={(e) => onEditLesson(lesson.id, "video_url", e.target.value)}
                placeholder="https://www.youtube.com/embed/..."
                className="h-8 text-sm"
              />
            </div>
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={() => createLesson.mutate({ title: "Nova aula", sort_order: lessons.length })}
        disabled={createLesson.isPending}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar aula
      </Button>
    </div>
  );
};

const ProductMembersTab = ({ productId, onDirtyChange }: Props) => {
  const { data: course, isLoading: courseLoading } = useCourseByProduct(productId);
  const createCourse = useCreateCourse();
  const queryClient = useQueryClient();

  const courseId = course?.id;
  const { data: modules = [], isLoading: modulesLoading } = useCourseModules(courseId);
  const createModule = useCreateCourseModule(courseId || "");
  const deleteModule = useDeleteCourseModule(courseId || "");

  const [openModules, setOpenModules] = useState<string[]>([]);
  const [pendingModuleEdits, setPendingModuleEdits] = useState<Record<string, Partial<{ title: string }>>>({});
  const [pendingLessonEdits, setPendingLessonEdits] = useState<LessonEdits>({});
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(pendingModuleEdits).length > 0 || Object.keys(pendingLessonEdits).length > 0;

  // Notify parent of dirty state
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (modules.length > 0 && openModules.length === 0) {
      setOpenModules([modules[0].id]);
    }
  }, [modules]);

  const toggleModule = (id: string) =>
    setOpenModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const handleModuleEdit = useCallback((moduleId: string, title: string) => {
    setPendingModuleEdits((prev) => ({ ...prev, [moduleId]: { title } }));
  }, []);

  const handleLessonEdit = useCallback((lessonId: string, field: string, value: string) => {
    setPendingLessonEdits((prev) => ({
      ...prev,
      [lessonId]: { ...prev[lessonId], [field]: value },
    }));
  }, []);

  // Filter out edits that match current DB values
  const getEffectiveModuleEdits = () => {
    const effective: typeof pendingModuleEdits = {};
    for (const [id, edits] of Object.entries(pendingModuleEdits)) {
      const mod = modules.find((m) => m.id === id);
      if (mod && edits.title !== undefined && edits.title !== mod.title) {
        effective[id] = edits;
      }
    }
    return effective;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const promises: Promise<any>[] = [];

      const effectiveModuleEdits = getEffectiveModuleEdits();
      for (const [id, updates] of Object.entries(effectiveModuleEdits)) {
        promises.push(updateCourseModule(id, updates));
      }

      for (const [id, updates] of Object.entries(pendingLessonEdits)) {
        promises.push(updateCourseLesson(id, updates));
      }

      await Promise.all(promises);

      setPendingModuleEdits({});
      setPendingLessonEdits({});

      // Invalidate to refresh data
      queryClient.invalidateQueries({ queryKey: ["course-modules"] });
      queryClient.invalidateQueries({ queryKey: ["course-lessons"] });

      toast.success("Alterações salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar alterações.");
    } finally {
      setSaving(false);
    }
  };

  if (courseLoading || modulesLoading) return <LoadingState />;

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <BookOpen className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nenhuma área de membros configurada para este produto.</p>
        <Button
          onClick={() => createCourse.mutate({ product_id: productId, title: "Meu Curso" })}
          disabled={createCourse.isPending}
        >
          {createCourse.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Criar área de membros
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> {modules.length} módulo(s)</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = `/app/products/${productId}/preview`;
            }}
          >
            <Eye className="h-4 w-4 mr-2" /> Preview
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar alterações
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {modules.map((mod, modIndex) => {
          const titleValue = pendingModuleEdits[mod.id]?.title ?? mod.title;
          return (
            <Collapsible key={mod.id} open={openModules.includes(mod.id)} onOpenChange={() => toggleModule(mod.id)}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-4">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                        {modIndex + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{titleValue}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180 shrink-0" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Separator />
                  <CardContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Título do módulo</Label>
                      <Input
                        value={titleValue}
                        onChange={(e) => handleModuleEdit(mod.id, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <ModuleLessons
                      moduleId={mod.id}
                      courseId={courseId!}
                      pendingEdits={pendingLessonEdits}
                      onEditLesson={handleLessonEdit}
                    />
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteModule.mutate(mod.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover módulo
                      </Button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      <Button
        variant="outline"
        onClick={() => createModule.mutate({ title: `Módulo ${modules.length + 1}`, sort_order: modules.length })}
        disabled={createModule.isPending}
      >
        <Plus className="h-4 w-4 mr-2" /> Adicionar módulo
      </Button>
    </div>
  );
};

export default ProductMembersTab;
