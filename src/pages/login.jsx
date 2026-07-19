import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Label, Input, Button } from "../components/ui";
import { toast } from "sonner";
import { ArrowLeft, Lock, User as UserIcon, Building2, Hash, User, Mail, Phone } from "lucide-react";

export default function Login() {
  const { type } = useParams();
  const navigate = useNavigate();
  
  const isHotel = type === "hotel";
  
  // State for Hotel Login
  const [hotelData, setHotelData] = useState({ id: "", password: "" });

  // State for Customer Login
  const [customerData, setCustomerData] = useState({ guestName: "", email: "", phoneNumber: "" });
  
  // State for Registration (Hotel only)
  const [isRegistering, setIsRegistering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // New state for loading
  const [regData, setRegData] = useState({ hotelName: "", hotelEmail: "", password: "" });

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      let payload = {};
      
      if (isHotel) {
        payload = { 
          type: "hotel",
          id: hotelData.id,
          password: hotelData.password
        };
      } else {
        payload = {
          type: "customer",
          guest_name: customerData.guestName,
          email: customerData.email,
          phone_number: customerData.phoneNumber
        };
      }

      const response = await fetch('/api/login', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.status || "Login failed");
      }

      if (isHotel) {
        navigate("/hotel-dashboard", { 
          state: { 
            hotelName: data.hotel_name,
            hotel_id: data.hotel_id 
          } 
        });
      } else {
        navigate("/customer-dashboard", { state: { guestData: data.guest_data, stats: data.stats } });
      }
      toast.success(`Welcome back!`);
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Login failed. Please check credentials.");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsProcessing(true); // Disable button and show processing
    try {
      const response = await fetch('/api/hotel-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel_name: regData.hotelName,
          hotel_email: regData.hotelEmail,
          password: regData.password
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.status || "Registration failed");

      toast.success("Registration Successful!");
      
      toast.message("Save your Hotel ID!", {
        description: `Your Login ID is: ${data.hotel_id}`,
        duration: 10000,
        action: {
          label: "Copy",
          onClick: () => navigator.clipboard.writeText(data.hotel_id),
        },
      });

      setIsRegistering(false);
      setHotelData({ id: data.hotel_id, password: "" });
      
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Registration failed");
    } finally {
      setIsProcessing(false); // Re-enable
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-none animate-slide-up">
        <CardHeader className="space-y-1 text-center pb-6">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isHotel ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'}`}>
            {isHotel ? (isRegistering ? <Building2 className="w-6 h-6"/> : <Lock className="w-6 h-6" />) : <UserIcon className="w-6 h-6" />}
          </div>
          <CardTitle className="text-2xl">
            {isHotel 
              ? (isRegistering ? "Register Hotel" : "Hotel Admin") 
              : "Guest Access"}
          </CardTitle>
          <CardDescription>
            {isHotel && isRegistering 
              ? "Create a new account for your property" 
              : "Sign in to view your sustainability dashboard"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* LOGIN FORMS */}
          {!isRegistering && (
            <form onSubmit={handleLogin} className="space-y-5">
              
              {/* HOTEL LOGIN INPUTS */}
              {isHotel && (
                <>
                  <div className="space-y-2">
                    <Label>Hotel ID</Label>
                    <Input 
                      placeholder="e.g. GRHOTEL" 
                      value={hotelData.id}
                      onChange={(e) => setHotelData({...hotelData, id: e.target.value})}
                      className="bg-slate-50"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input 
                      type="password"
                      placeholder="••••••••" 
                      value={hotelData.password}
                      onChange={(e) => setHotelData({...hotelData, password: e.target.value})}
                      className="bg-slate-50"
                      required
                    />
                  </div>
                </>
              )}

              {/* CUSTOMER LOGIN INPUTS */}
              {!isHotel && (
                <>
                  <div className="space-y-2">
                    <Label>Guest Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input 
                        placeholder="e.g. John Doe" 
                        value={customerData.guestName}
                        onChange={(e) => setCustomerData({...customerData, guestName: e.target.value})}
                        className="pl-10 bg-slate-50"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input 
                        type="email"
                        placeholder="guest@example.com" 
                        value={customerData.email}
                        onChange={(e) => setCustomerData({...customerData, email: e.target.value})}
                        className="pl-10 bg-slate-50"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input 
                        type="tel"
                        placeholder="e.g. +91 9876543210" 
                        value={customerData.phoneNumber}
                        onChange={(e) => setCustomerData({...customerData, phoneNumber: e.target.value})}
                        className="pl-10 bg-slate-50"
                        required
                      />
                    </div>
                  </div>
                </>
              )}
              
              <div className="pt-2">
                <Button type="submit" className={`w-full ${!isHotel && 'bg-accent border-accent text-white hover:bg-accent/90'}`}>
                  Continue to Dashboard
                </Button>
              </div>
            </form>
          )}

          {/* REGISTRATION FORM (Hotel Only) */}
          {isRegistering && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <Label>Hotel Name</Label>
                <Input 
                  placeholder="e.g. Grand Valley Resort" 
                  value={regData.hotelName}
                  onChange={(e) => setRegData({...regData, hotelName: e.target.value})}
                  className="bg-slate-50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Official Email</Label>
                <Input 
                  type="email"
                  placeholder="admin@hotel.com" 
                  value={regData.hotelEmail}
                  onChange={(e) => setRegData({...regData, hotelEmail: e.target.value})}
                  className="bg-slate-50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Set Password</Label>
                <Input 
                  type="password"
                  placeholder="Create a strong password" 
                  value={regData.password}
                  onChange={(e) => setRegData({...regData, password: e.target.value})}
                  className="bg-slate-50"
                  required
                />
              </div>
              
              <div className="pt-2">
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isProcessing}>
                  {isProcessing ? "Processing..." : "Register Property"}
                </Button>
              </div>
            </form>
          )}

          {/* TOGGLE LINK (Only for Hotels) */}
          {isHotel && (
            <div className="text-center mt-6">
              <button 
                type="button"
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm text-slate-500 hover:text-primary underline underline-offset-4 transition-colors"
              >
                {isRegistering ? "Already have an account? Login" : "Don't have an ID? Register New Hotel"}
              </button>
            </div>
          )}
            
          <Button type="button" variant="ghost" className="w-full mt-4" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2"/> Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}