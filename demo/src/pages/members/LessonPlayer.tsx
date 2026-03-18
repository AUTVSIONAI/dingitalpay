import { useState } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Play, Lock, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { fetchCourseFullDetail, toggleLessonComplete } from "@/services/members.service";
import LoadingState from "@/components/shared/LoadingState";
import { toast } from "sonner";

const LessonPlayer = () => {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: course, isLoading } = useQuery({
    queryKey: ["course-full", courseId],
    queryFn: () => fetchCourseFullDetail(courseId || ""),
    enabled: !!courseId,
  });

  const allLessons = course?.modules.flatMap(m => m.lessons) || [];
  const currentIndex = allLessons.findIndex(l => l.id === lessonId);
  const currentLesson = allLessons[currentIndex];
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
  const [completed, setCompleted] = useState(currentLesson?.completed || false);

  // Sync completed state when lesson changes
  if (currentLesson && currentLesson.completed !== completed && currentLesson.id === lessonId) {
    setCompleted(currentLesson.completed);
  }

  const completeMutation = useMutation({
    mutationFn: ({ lessonId, completed }: { lessonId: string; completed: boolean }) =>
      toggleLessonComplete(lessonId, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-full", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course-detail", courseId] });
      queryClient.invalidateQueries({ queryKey: ["member-courses"] });
    },
    onError: () => toast.error("Erro ao atualizar progresso"),
  });

  usePageMeta(
    course && currentLesson
      ? [{ label: "Membros" }, { label: "Meus Cursos", path: "/members/courses" }, { label: course.title, path: `/members/courses/${courseId}` }, { label: currentLesson.title }]
      : [{ label: "Aula" }],
    currentLesson?.title || "Não encontrado"
  );

  if (isLoading) return <LoadingState />;
  if (!course) return <p className="text-muted-foreground">Curso não encontrado.</p>;
  if (!currentLesson) return <p className="text-muted-foreground">Aula não encontrada.</p>;

  const handleToggleComplete = () => {
    const newVal = !completed;
    setCompleted(newVal);
    completeMutation.mutate({ lessonId: currentLesson.id, completed: newVal });
  };

  return (
    <PageContent>
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
              <Button size="sm" variant={completed ? "secondary" : "default"} onClick={handleToggleComplete} disabled={completeMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" />{completed ? "Concluída" : "Marcar como concluída"}
              </Button>
              <span className="text-xs text-muted-foreground">{currentLesson.duration}</span>
            </div>
            <div className="flex items-center gap-2">
              {prevLesson && !prevLesson.locked && (<Button size="sm" variant="outline" onClick={() => navigate(`/members/courses/${courseId}/lessons/${prevLesson.id}`)}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>)}
              {nextLesson && !nextLesson.locked && (<Button size="sm" onClick={() => navigate(`/members/courses/${courseId}/lessons/${nextLesson.id}`)}>Próxima <ChevronRight className="h-4 w-4 ml-1" /></Button>)}
            </div>
          </div>
          <Card><CardContent className="pt-4"><h3 className="font-semibold text-foreground">{currentLesson.title}</h3>{course.description && <p className="text-sm text-muted-foreground mt-1">{course.description}</p>}</CardContent></Card>
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <Card className="sticky top-20">
            <CardContent className="p-0">
              <div className="p-4 border-b border-border"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h4 className="font-semibold text-sm text-foreground">Conteúdo do curso</h4></div></div>
              <ScrollArea className="h-[calc(100vh-300px)] max-h-[500px]">
                {course.modules.map((mod) => (
                  <div key={mod.id}>
                    <div className="px-4 py-2 bg-muted/50"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{mod.title}</p></div>
                    {mod.lessons.map((lesson) => {
                      const isActive = lesson.id === lessonId;
                      return (
                        <div key={lesson.id}
                          className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors cursor-pointer ${isActive ? "bg-primary/10 border-l-2 border-primary" : lesson.locked ? "opacity-40 cursor-not-allowed" : "hover:bg-accent/50"}`}
                          onClick={() => { if (!lesson.locked) navigate(`/members/courses/${courseId}/lessons/${lesson.id}`); }}>
                          <div className="shrink-0">
                            {lesson.completed || (isActive && completed) ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : lesson.locked ? <Lock className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-muted-foreground" />}
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
    </PageContent>
  );
};

export default LessonPlayer;
