import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Home from "./pages/home";
import Login from "./pages/login";
import HotelDashboard from "./pages/hoteldashboard";
import CustomerDashboard from "./pages/customerdashboard";
import GuestEntry from "./pages/guestentry";

/**
 * Main Application Component
 * Sets up the routing structure and global toast notification provider.
 */
const App = () => (
  <>
    {/* Global Toast Provider */}
    <Toaster position="top-right" richColors />
    
    {/* Application Routing */}
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Dynamic route for login type (hotel or customer) */}
        <Route path="/login/:type" element={<Login />} />
        
        {/* Protected Routes */}
        <Route path="/hotel-dashboard" element={<HotelDashboard />} />
        <Route path="/guest/:id" element={<GuestEntry />} /> 
        <Route path="/customer-dashboard" element={<CustomerDashboard />} />
      </Routes>
    </BrowserRouter>
  </>
);

export default App;