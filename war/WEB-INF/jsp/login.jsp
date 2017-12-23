<html>
<title>Taming the Elements - Login</title>

<body style="background-color: #cccccc">
	<h1>Taming the Elements - Login</h1>
	<div style="color: red">
	<%
	if (session.getAttribute("lastError") != null) {
		out.println(session.getAttribute("lastError"));
	}
	%>
	</div>

	<form method="post" action="/login">
		<fieldset style="width: 250px; padding: 5px">
			<legend>Login:</legend>
			<table>
				<tr>
					<td>Username:</td>
					<td><input type="text" name="username" /></td>
				</tr>
				<tr>
					<td>Password:</td>
					<td><input type="password" name="password" /></td>
				</tr>
			</table>
		</fieldset>
		<input type="submit" value="Submit" />
	</form>
</body>
</html>
