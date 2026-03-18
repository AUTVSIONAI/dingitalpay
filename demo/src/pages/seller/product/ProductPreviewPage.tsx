import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useProduct } from "@/hooks/useProducts";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { fetchCoursePreviewByProduct } from "@/services/product.service";
import { isDemo } from "@/lib/demo-utils";
import { demoCourseDetail } from "@/data/customer-stubs/courses";
import PageContent from "@/components/layout/PageContent";
import LoadingState from "@/components/shared/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Play, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Lock, Eye, GraduationCap, BookOpen, ArrowLeft,
} from "lucide-react";
import type { LessonFull, CourseDetailFull } from "@/types/api";

type ViewMode = "listing" | "detail" | "lesson";

const ProductPreviewPage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { data: product } = useProduct(productId);
  const demo = isDemo();

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["course-preview", demo ? "demo" : productId],
    queryFn: () => {
      if (demo) return demoCourseDetail;
      return fetchCoursePreviewByProduct(productId!);
    },
    enabled: demo || !!productId,
  });

  usePageMeta(
    [
      { label: "Vendedor", path: "/app" },
      { label: "Produtos", path: "/app/products" },
      { label: product?.name || "Produto", path: `/app/products/${productId}` },
      { label: "Preview" },
    ],
    "Preview"
  );

  if (courseLoading) {
    return <PageContent><LoadingState /></PageContent>;
  }

  if (!course) {
    return (
      <PageContent>
        <div className="text-center py-12 space-y-4">
          <p className="text-lg font-medium text-foreground">Nenhuma área de membros encontrada</p>
          <p className="text-sm text-muted-foreground">Configure a área de membros primeiro.</p>
          <Button variant="outline" onClick={() => navigate(`/app/products/${productId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao produto
          </Button>
        </div>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <div className="relative">
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 text-center mb-6">
          <p className="text-sm text-primary font-medium flex items-center justify-center gap-2">
            <Eye className="h-4 w-4" />
            Modo Preview — Visualização como o comprador verá
          </p>
        </div>
        <PreviewContent course={course} onBack={() => navigate(`/app/products/${productId}`)} />
      </div>
    </PageContent>
  );
};

const PreviewContent = ({ course, onBack }: { course: CourseDetailFull; onBack: () => void }) => {
  const [view, setView] = useState<ViewMode>("listing");
  const [openModules, setOpenModules] = useState<string[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  const allLessons = course.modules.flatMap(m => m.lessons);
  const currentLesson = allLessons.find(l => l.id === selectedLessonId) || null;
  const currentIndex = currentLesson ? allLessons.findIndex(l => l.id === selectedLessonId) : -1;
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const openLesson = (lesson: LessonFull) => {
    if (!lesson.locked) {
      setSelectedLessonId(lesson.id);
      setView("lesson");
    }
  };

  const toggleModule = (id: string) =>
    setOpenModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  // ── Listing View ──
  if (view === "listing") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao produto
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Área de membros</h2>
            <p className="text-sm text-muted-foreground">Visualização como o comprador verá</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Card
            className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
            onClick={() => {
              setView("detail");
              if (course.modules.length > 0) {
                setOpenModules(course.modules.slice(0, 2).map(m => m.id));
              }
            }}
          >
            <div className="aspect-video bg-muted relative overflow-hidden">
              <img src="/placeholder.svg" alt={course.title} className="object-cover w-full h-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                <span className="text-white text-sm font-medium flex items-center gap-1">
                  <BookOpen className="h-4 w-4" /> Continuar
                </span>
              </div>
            </div>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground text-sm leading-tight">{course.title}</h3>
                <Badge variant="default" className="shrink-0 text-xs">Em andamento</Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0 de {allLessons.length} aulas</span>
                  <span>0%</span>
                </div>
                <Progress value={0} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Lesson Player View ──
  if (view === "lesson" && currentLesson) {
    return (
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {currentLesson.videoUrl ? (
              <iframe src={currentLesson.videoUrl} title={currentLesson.title} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50"><Lock className="h-8 w-8" /></div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="secondary" disabled>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar como concluída
              </Button>
              <span className="text-xs text-muted-foreground">{currentLesson.duration}</span>
            </div>
            <div className="flex items-center gap-2">
              {prevLesson && !prevLesson.locked && (
                <Button size="sm" variant="outline" onClick={() => openLesson(prevLesson)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
              )}
              {nextLesson && !nextLesson.locked && (
                <Button size="sm" onClick={() => openLesson(nextLesson)}>
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
          <Card>
            <CardContent className="pt-4">
              <h3 className="font-semibold text-foreground">{currentLesson.title}</h3>
              {course.description && <p className="text-sm text-muted-foreground mt-1">{course.description}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <Card className="sticky top-20">
            <CardContent className="p-0">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold text-sm text-foreground">Conteúdo do curso</h4>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setView("detail")}>
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[calc(100vh-300px)] max-h-[500px]">
                {course.modules.map((mod) => (
                  <div key={mod.id}>
                    <div className="px-4 py-2 bg-muted/50">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{mod.title}</p>
                    </div>
                    {mod.lessons.map((lesson) => {
                      const isActive = lesson.id === selectedLessonId;
                      return (
                        <div
                          key={lesson.id}
                          className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors cursor-pointer ${isActive ? "bg-primary/10 border-l-2 border-primary" : lesson.locked ? "opacity-40 cursor-not-allowed" : "hover:bg-accent/50"}`}
                          onClick={() => openLesson(lesson)}
                        >
                          <div className="shrink-0">
                            {lesson.locked ? <Lock className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <span className={`flex-1 truncate ${isActive ? "font-medium text-primary" : "text-foreground"}`}>{lesson.title}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{lesson.duration}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Detail View ──
  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => setView("listing")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <h2 className="text-xl font-bold text-foreground">{course.title}</h2>
              <p className="text-sm text-muted-foreground">{course.description}</p>
            </div>
            <div className="text-center sm:text-right space-y-1 shrink-0">
              <p className="text-2xl font-bold text-primary">0%</p>
              <p className="text-xs text-muted-foreground">0/{allLessons.length} aulas</p>
            </div>
          </div>
          <Progress value={0} className="h-2 mt-4" />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {course.modules.map((mod, modIndex) => (
          <Collapsible key={mod.id} open={openModules.includes(mod.id)} onOpenChange={() => toggleModule(mod.id)}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardContent className="py-4 cursor-pointer hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                      {modIndex + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{mod.title}</p>
                      <p className="text-xs text-muted-foreground">0/{mod.lessons.length} aulas concluídas</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180 shrink-0" />
                  </div>
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Separator />
                <div className="divide-y divide-border">
                  {mod.lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className={`flex items-center gap-3 px-6 py-3 transition-colors ${lesson.locked ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/30 cursor-pointer"}`}
                      onClick={() => openLesson(lesson)}
                    >
                      <div className="shrink-0">
                        {lesson.locked ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Play className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{lesson.title}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{lesson.duration}</span>
                      {lesson.locked && <Badge variant="secondary" className="text-xs shrink-0">Bloqueada</Badge>}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  );
};

export default ProductPreviewPage;
