import { useNavigate } from "react-router-dom";
import { Card, CardContent, Button } from "../components/ui";
import { Leaf, Building2, User, ArrowRight } from "lucide-react";

/**
 * Landing Page Component
 * Serves as the entry point, offering navigation to Hotel or Guest portals.
 */
export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] bg-accent/5 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none"></div>

      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-2xl z-10 animate-slide-up">
        <div className="inline-flex items-center justify-center p-4 bg-white rounded-2xl shadow-soft mb-4 ring-1 ring-slate-100">
          <Leaf className="w-10 h-10 text-primary" />
        </div>
        
        <h1 className="text-5xl md:text-6xl font-extrabold text-slate-800 tracking-tight">
          Travel <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-600">Sustainably</span>
        </h1>
        
        <p className="text-xl text-slate-500 font-light leading-relaxed">
          The modern way to track, manage, and reduce your carbon footprint during your hotel stays.
        </p>
      </div>

      {/* Navigation Cards */}
      <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl mt-12 z-10">
        
        {/* Hotel Portal Card */}
        <Card className="hover:-translate-y-1 transition-transform duration-300 cursor-pointer border-t-4 border-t-primary" onClick={() => navigate("/login/hotel")}>
          <CardContent className="p-8 flex flex-col items-center text-center h-full">
            <div className="p-4 bg-primary/10 rounded-full mb-6">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-2">For Hotels</h3>
            <p className="text-slate-500 mb-8 flex-grow">Manage guests, track resource consumption, and generate detailed emission reports.</p>
            <Button className="w-full gap-2">
              Hotel Portal <ArrowRight className="w-4 h-4"/>
            </Button>
          </CardContent>
        </Card>

        {/* Guest Portal Card */}
        <Card className="hover:-translate-y-1 transition-transform duration-300 cursor-pointer border-t-4 border-t-accent" onClick={() => navigate("/login/customer")}>
          <CardContent className="p-8 flex flex-col items-center text-center h-full">
            <div className="p-4 bg-accent/10 rounded-full mb-6">
              <User className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-2xl font-bold mb-2">For Guests</h3>
            <p className="text-slate-500 mb-8 flex-grow">View your personal impact score, discover tips, and earn eco-rewards.</p>
            <Button variant="outline" className="w-full gap-2 border-accent text-accent hover:bg-accent/5">
              Guest Portal <ArrowRight className="w-4 h-4"/>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}