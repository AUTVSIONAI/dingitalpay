import { useState, useEffect } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Play, CheckCircle2, ChevronDown, Lock } from "lucide-react";
import { fetchCourseDetail } from "@/services/members.service";
import LoadingState from "@/components/shared/LoadingState";

const CoursePage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [openModules, setOpenModules] = useState<string[]>([]);
  const [autoOpened, setAutoOpened] = useState(false);

  const { data: course, isLoading } = useQuery({
    queryKey: ["course-detail", courseId],
    queryFn: () => fetchCourseDetail(courseId || ""),
    enabled: !!courseId,
  });

  usePageMeta(
    [{ label: "Membros" }, { label: "Meus Cursos", path: "/members/courses" }, { label: course?.title || "Carregando..." }],
    course?.title || "Curso"
  );

  // Auto-open first two modules when data loads
  useEffect(() => {
    if (course && !autoOpened && course.modules.length > 0) {
      setOpenModules(course.modules.slice(0, 2).map(m => m.id));
      setAutoOpened(true);
    }
  }, [course, autoOpened]);

  if (isLoading) return <LoadingState />;

  if (!course) {
    return (
      <div className="text-center py-12"><p className="text-muted-foreground">Curso não encontrado.</p><Button variant="outline" className="mt-4" onClick={() => navigate("/members/courses")}>Voltar</Button></div>
    );
  }

  const allLessons = course.modules.flatMap(m => m.lessons);
  const completedCount = allLessons.filter(l => l.completed).length;
  const progress = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;
  const toggleModule = (id: string) => setOpenModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  return (
    <PageContent>
      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 space-y-1"><h2 className="text-xl font-bold text-foreground">{course.title}</h2><p className="text-sm text-muted-foreground">{course.description}</p></div>
              <div className="text-center sm:text-right space-y-1 shrink-0"><p className="text-2xl font-bold text-primary">{progress}%</p><p className="text-xs text-muted-foreground">{completedCount}/{allLessons.length} aulas</p></div>
            </div>
            <Progress value={progress} className="h-2 mt-4" />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {course.modules.map((mod, modIndex) => {
            const modCompleted = mod.lessons.filter(l => l.completed).length;
            const allDone = modCompleted === mod.lessons.length;
            return (
              <Collapsible key={mod.id} open={openModules.includes(mod.id)} onOpenChange={() => toggleModule(mod.id)}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardContent className="py-4 cursor-pointer hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">{allDone ? <CheckCircle2 className="h-4 w-4" /> : modIndex + 1}</div>
                        <div className="flex-1 min-w-0"><p className="font-medium text-foreground text-sm">{mod.title}</p><p className="text-xs text-muted-foreground">{modCompleted}/{mod.lessons.length} aulas concluídas</p></div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180 shrink-0" />
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Separator />
                    <div className="divide-y divide-border">
                      {mod.lessons.map((lesson) => (
                        <div key={lesson.id} className={`flex items-center gap-3 px-6 py-3 transition-colors ${lesson.locked ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/30 cursor-pointer"}`}
                          onClick={() => { if (!lesson.locked) navigate(`/members/courses/${courseId}/lessons/${lesson.id}`); }}>
                          <div className="shrink-0">
                            {lesson.completed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : lesson.locked ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Play className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0"><p className="text-sm text-foreground">{lesson.title}</p></div>
                          <span className="text-xs text-muted-foreground shrink-0">{lesson.duration}</span>
                          {lesson.completed && <Badge variant="secondary" className="text-xs shrink-0">Concluída</Badge>}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </PageContent>
  );
};

export default CoursePage;
