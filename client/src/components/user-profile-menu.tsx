import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { User, Settings, LogOut } from "lucide-react";

export function UserProfileMenu() {
  const { user, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  if (!user) return null;

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const handleAdminClick = () => {
    setLocation("/admin");
  };

  // Get user initials for avatar fallback
  const getInitials = () => {
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) {
      return firstName.charAt(0).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  const getDisplayName = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) {
      return user.firstName;
    }
    return user.email;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="relative h-9 w-9 rounded-full"
          data-testid="button-user-profile"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.profileImage} alt={getDisplayName()} />
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none" data-testid="text-user-name">
              {getDisplayName()}
            </p>
            <p className="text-xs leading-none text-muted-foreground" data-testid="text-user-email">
              {user.email}
            </p>
            <p className="text-xs leading-none text-muted-foreground mt-1">
              <span className="capitalize">{user.role}</span>
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isAdmin && (
          <>
            <DropdownMenuItem 
              onClick={handleAdminClick}
              data-testid="menu-item-admin"
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Admin</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem 
          onClick={handleLogout}
          data-testid="menu-item-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
