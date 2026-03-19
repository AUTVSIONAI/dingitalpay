import { useState, useEffect } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import DataTable, { DataTableColumn } from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Edit, Trash2, Phone, Calendar, Shield, MapPin, Save, Package } from "lucide-react";
import type { User, UserRole } from "@/types";
import { getAdminUsers, getAdminUserProducts, updateAdminUser, deleteAdminUser } from "@/services/admin.service";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { maskPhone } from "@/lib/masks";
import { formatDatePtBr } from "@/lib/timezone";

const roleLabels: Record<UserRole, string> = { admin: "Admin", seller: "Vendedor", buyer: "Comprador" };
const roleVariants: Record<UserRole, "default" | "secondary" | "outline"> = { admin: "default", seller: "secondary", buyer: "outline" };

const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [viewSheetOpen, setViewSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editForm, setEditForm] = useState<User | null>(null);
  const [userProducts, setUserProducts] = useState<{ id: string; name: string; price: string; status: string }[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAdminUsers();
        setUsers(data);
      } catch {
        void 0;
      }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = users.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.phone?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const handleViewProfile = async (user: User) => {
    setSelectedUser(user);
    setViewSheetOpen(true);
    try {
      const prods = await getAdminUserProducts(user.id);
      setUserProducts(prods);
    } catch { setUserProducts([]); }
  };

  const handleEditUser = (user: User) => {
    setEditForm({ ...user });
    setSelectedUser(user);
    setEditSheetOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    try {
      await updateAdminUser(editForm.id, { name: editForm.name, phone: editForm.phone, role: editForm.role });
      setUsers((prev) => prev.map((u) => u.id === editForm.id ? { ...editForm } : u));
      toast({ title: "Usuário atualizado", description: `As informações de ${editForm.name} foram salvas.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    }
    setEditSheetOpen(false);
  };

  const openDeleteDialog = (user: User) => {
    setUserToDelete(user);
    setDeleteConfirmText("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || deleteConfirmText !== "EXCLUIR") return;
    setDeleting(true);
    try {
      await deleteAdminUser(userToDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      toast({ title: "Usuário excluído", description: `${userToDelete.name} e todos os dados vinculados foram removidos.` });
      setDeleteDialogOpen(false);
      setViewSheetOpen(false);
      setEditSheetOpen(false);
    } catch {
      toast({ title: "Erro", description: "Não foi possível excluir o usuário.", variant: "destructive" });
    }
    setDeleting(false);
  };

  const columns: DataTableColumn<User>[] = [
    {
      key: "name", header: "Usuário",
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{row.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium text-foreground">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.phone}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Tipo", render: (row) => <Badge variant={roleVariants[row.role]}>{roleLabels[row.role]}</Badge> },
    { key: "createdAt", header: "Cadastro", render: (row) => <span className="text-sm text-muted-foreground">{formatDatePtBr(row.createdAt)}</span> },
  ];

  const isSelf = (user: User) => currentUser?.id === user.id;

  const deleteButton = (user: User) => {
    if (isSelf(user)) return null;
    return (
      <>
        <Separator />
        <Button variant="destructive" size="sm" className="w-full" onClick={() => openDeleteDialog(user)}>
          <Trash2 className="h-4 w-4 mr-1" /> Excluir usuário
        </Button>
      </>
    );
  };

  const renderViewContent = (user: User) => (
    <>
      <div className="flex items-center gap-4 pb-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-lg font-semibold">{user.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-lg font-semibold text-foreground">{user.name}</p>
          <Badge variant={roleVariants[user.role]}>{roleLabels[user.role]}</Badge>
        </div>
      </div>
      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="geral" className="flex-1">Geral</TabsTrigger>
          <TabsTrigger value="produtos" className="flex-1">Produtos</TabsTrigger>
        </TabsList>
        <TabsContent value="geral" className="space-y-5 mt-4">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Contato</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-foreground">{user.phone || "-"}</span></div>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Conta</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm"><Shield className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Tipo:</span><span className="text-foreground">{roleLabels[user.role]}</span></div>
              <div className="flex items-center gap-3 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Cadastro:</span><span className="text-foreground">{formatDatePtBr(user.createdAt)}</span></div>
              <div className="flex items-center gap-3 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">ID:</span><span className="text-foreground font-mono text-xs">{user.id.slice(0, 8)}...</span></div>
            </div>
          </div>
          <Separator />
          <Button variant="outline" size="sm" className="w-full" onClick={() => { setViewSheetOpen(false); handleEditUser(user); }}>
            <Edit className="h-4 w-4 mr-1" /> Editar
          </Button>
          {deleteButton(user)}
        </TabsContent>
        <TabsContent value="produtos" className="mt-4">
          {userProducts.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6 text-muted-foreground" />} title="Nenhum produto" description="Este usuário não possui produtos cadastrados." />
          ) : (
            <div className="space-y-3">
              {userProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.price}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );

  const renderEditContent = (user: User) => {
    if (!editForm) return null;
    return (
      <>
        <div className="flex items-center gap-4 pb-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg font-semibold">{user.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold text-foreground">{editForm.name}</p>
            <Badge variant={roleVariants[user.role]}>{roleLabels[user.role]}</Badge>
          </div>
        </div>
        <div className="space-y-5">
          <div className="space-y-2"><Label>Nome</Label><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Telefone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v as UserRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="seller">Vendedor</SelectItem>
                <SelectItem value="buyer">Comprador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditSheetOpen(false)}>Cancelar</Button>
            <Button size="sm" className="flex-1" onClick={handleSaveEdit}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
          </div>
          {deleteButton(user)}
        </div>
      </>
    );
  };

  usePageMeta([{ label: "Admin", path: "/admin" }, { label: "Usuários" }], "Gestão de Usuários");

  if (loading) return <LoadingState />;

  return (
    <PageContent>
      <FilterBar
        searchPlaceholder="Buscar por nome..." searchValue={search} onSearchChange={setSearch}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="seller">Vendedor</SelectItem>
                <SelectItem value="buyer">Comprador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        className="mb-4"
      />
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "usuário encontrado" : "usuários encontrados"}</p>
      </div>
      <DataTable columns={columns} data={filtered} onRowClick={handleViewProfile} emptyMessage="Nenhum usuário encontrado." />

      <Sheet open={viewSheetOpen} onOpenChange={setViewSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedUser && (
            <>
              <SheetHeader>
                <SheetTitle>Perfil do Usuário</SheetTitle>
                <SheetDescription>Informações detalhadas do usuário.</SheetDescription>
              </SheetHeader>
              <div className="py-4">{renderViewContent(selectedUser)}</div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {editForm && selectedUser && (
            <>
              <SheetHeader>
                <SheetTitle>Editar Usuário</SheetTitle>
                <SheetDescription>Atualize as informações do usuário.</SheetDescription>
              </SheetHeader>
              <div className="py-4">{renderEditContent(selectedUser)}</div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Todos os dados vinculados a <strong>{userToDelete?.name}</strong> serão permanentemente excluídos, incluindo produtos, vendas, conquistas e demais registros.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Digite <strong>EXCLUIR</strong> para confirmar</Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="EXCLUIR"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "EXCLUIR" || deleting}
              onClick={handleDeleteUser}
            >
              {deleting ? "Excluindo..." : "Excluir usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
};

export default AdminUsers;
